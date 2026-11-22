import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Emit an installable Coolify Compose definition. No secret is needed to render it.
const upstream = "76883d49435524645397b9f7a0048d92f69b8330";
const repo = fileURLToPath(new URL("../../", import.meta.url));
const [appOrigin, network, revision, mailMode, ...extra] = process.argv.slice(2);
const resendTest = mailMode === "--resend-test";
if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(appOrigin ?? "")
    || !/^[a-z0-9-]+$/u.test(network ?? "") || !/^[0-9a-f]{40}$/u.test(revision ?? "")
    || extra.length || (mailMode !== undefined && !resendTest)
    || (resendTest && !/^https:\/\/muntireport(?:\.\d{1,3}){4}\.sslip\.io$/u.test(appOrigin))) {
  throw new Error("Usage: node ops/coolify/build-synthetic-supabase.mjs <https-origin> <private-network> <git-commit> [--resend-test]");
}
const selected = ["db", "auth", "rest", "realtime", "storage", "imgproxy", "api-gw"];
const reference = (name) => `\${PULONG_${name}:?Missing staging runtime input}`;
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const getUpstream = async (name) => {
  const res = await fetch(`https://raw.githubusercontent.com/supabase/supabase/${upstream}/docker/${name}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Pinned Supabase asset unavailable: ${name} (${res.status})`);
  return res.text();
};
const scratch = await mkdtemp(join(tmpdir(), "pulong-compose-"));
let base;
try {
  const file = join(scratch, "docker-compose.yml");
  await writeFile(file, await getUpstream("docker-compose.yml"));
  base = JSON.parse(execFileSync("docker", ["compose", "--env-file", "/dev/null", "-f", file, "config", "--no-interpolate", "--no-env-resolution", "--no-path-resolution", "--format", "json"], { encoding: "utf8" }));
} finally {
  await rm(scratch, { recursive: true });
}

const model = { services: {}, configs: {}, volumes: { "data": {}, "db-config": {}, "evidence": {} }, networks: { staging: { external: true, name: network } } };
function mount(service, name, target, content) {
  if (name in model.configs) throw new Error(`Duplicate Compose asset: ${name}`);
  // File contents from a bind mount must not be interpolated by Compose.
  model.configs[name] = { content: content.replaceAll("$", () => "$$") };
  (service.configs ??= []).push({ source: name, target });
}
const replacements = {
  ANON_KEY: reference("ANON_KEY"), SERVICE_ROLE_KEY: reference("SERVICE_KEY"), JWT_SECRET: reference("JWT_SECRET"),
  POSTGRES_PASSWORD: reference("DB_PASSWORD"), SECRET_KEY_BASE: reference("REALTIME_SECRET"),
  REALTIME_DB_ENC_KEY: reference("REALTIME_ENCRYPTION"), RELEASE_COOKIE: reference("RELEASE_COOKIE"),
  S3_PROTOCOL_ACCESS_KEY_ID: reference("S3_ID"), S3_PROTOCOL_ACCESS_KEY_SECRET: reference("S3_SECRET"),
};
const fixed = {
  POSTGRES_HOST: "db", POSTGRES_PORT: "5432", POSTGRES_DB: "postgres", JWT_EXPIRY: "900",
  API_EXTERNAL_URL: appOrigin, SUPABASE_PUBLIC_URL: appOrigin, SITE_URL: appOrigin,
  ADDITIONAL_REDIRECT_URLS: `${appOrigin}/auth/callback`, DISABLE_SIGNUP: "true",
  ENABLE_ANONYMOUS_USERS: "false", ENABLE_EMAIL_AUTOCONFIRM: "false", ENABLE_EMAIL_SIGNUP: "true",
  ENABLE_PHONE_AUTOCONFIRM: "false", ENABLE_PHONE_SIGNUP: "false",
  SMTP_ADMIN_EMAIL: "no-reply@example.test", SMTP_HOST: "mailpit", SMTP_PORT: "1025", SMTP_USER: "", SMTP_PASS: "", SMTP_SENDER_NAME: "Munti Report",
  MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify", MAILER_URLPATHS_EMAIL_CHANGE: "/auth/v1/verify",
  MAILER_URLPATHS_INVITE: "/auth/v1/verify", MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
  PGRST_DB_SCHEMAS: "public,storage,graphql_public", PGRST_DB_MAX_ROWS: "1000", PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions",
  SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SECRET_KEY: "", ANON_KEY_ASYMMETRIC: "", SERVICE_ROLE_KEY_ASYMMETRIC: "",
  DASHBOARD_USERNAME: "disabled", DASHBOARD_PASSWORD: reference("DASHBOARD_PASSWORD"),
  STORAGE_TENANT_ID: "pulong-staging", GLOBAL_S3_BUCKET: "pulong-synthetic-evidence", REGION: "local", IMGPROXY_AUTO_WEBP: "true",
};
function interpolate(value) {
  const result = String(value).replaceAll(/\$\{([A-Z_0-9]+)(?::-[^{}]*)?\}/gu, (source, name) => {
    const resolved = replacements[name] ?? fixed[name];
    return resolved === undefined ? source : resolved;
  });
  const unresolved = [...result.matchAll(/\$\{([A-Z0-9_]+)/gu)].map((m) => m[1]).filter((name) => !name.startsWith("PULONG_"));
  if (unresolved.length) throw new Error(`Unreviewed upstream inputs: ${unresolved.join(", ")}`);
  return result;
}

await Promise.all(selected.map(async (name) => {
  const source = base.services[name];
  if (!source) throw new Error(`Pinned service was not found: ${name}`);
  const service = { image: source.image, restart: "unless-stopped", environment: {}, ...(source.command ? { command: source.command } : {}), ...(source.entrypoint ? { entrypoint: source.entrypoint } : {}) };
  if (source.depends_on) service.depends_on = Object.fromEntries(Object.entries(source.depends_on).filter(([key]) => selected.includes(key)));
  if (source.healthcheck) service.healthcheck = { ...source.healthcheck, test: source.healthcheck.test.map(interpolate) };
  for (const [key, value] of Object.entries(source.environment ?? {})) {
    // Upstream permits an optional asymmetric-key fallback; this isolated trial uses legacy signed role JWTs.
    service.environment[key] = key === "PGRST_JWT_SECRET" ? replacements.JWT_SECRET : interpolate(value ?? "");
  }
  for (const volume of source.volumes ?? []) {
    const { source: from, target } = volume;
    if (target === "/var/lib/postgresql/data") (service.volumes ??= []).push(`data:${target}`);
    else if (target === "/var/lib/storage") (service.volumes ??= []).push(`evidence:${target}${name === "imgproxy" ? ":ro" : ""}`);
    else if (from === "db-config") (service.volumes ??= []).push(`db-config:${target}`);
    else {
      if (!/^\.\/volumes\//u.test(from) || !/\.(yaml|sql|sh)$/u.test(from)) throw new Error(`Unreviewed upstream volume: ${from}`);
      mount(service, `${name}-${from.split("/").at(-1).replaceAll(".", "-")}`, target, await getUpstream(from.slice(2)));
    }
  }
  if (name === "api-gw") {
    // Internal application access; none of the upstream gateway's APIs get a public domain.
    service.networks = { default: {}, staging: { aliases: ["pulong-supabase-gateway"] } };
  }
  if (name === "realtime") {
    // Envoy dials this DNS name; Realtime selects its tenant from the first label.
    service.networks = { default: { aliases: ["realtime-dev.supabase-realtime"] } };
  }
  if (name === "auth") {
    service.environment.GOTRUE_MAILER_OTP_LENGTH = "6";
    service.environment.GOTRUE_MAILER_OTP_EXP = "600";
    if (resendTest) {
      Object.assign(service.environment, {
        // Keep the verified sender until a Munti Report mail domain and scoped key are ready.
        GOTRUE_SMTP_ADMIN_EMAIL: "no-reply@pulong.danilocasim.dev",
        GOTRUE_SMTP_HOST: "smtp.resend.com",
        GOTRUE_SMTP_PORT: "587",
        GOTRUE_SMTP_USER: "resend",
        GOTRUE_SMTP_PASS: reference("RESEND_SMTP_KEY"),
      });
    }
    for (const [kind, file] of [["MAGIC_LINK", "magic-link"], ["CONFIRMATION", "confirmation"], ["INVITE", "invite"], ["RECOVERY", "recovery"]]) {
      service.environment[`GOTRUE_MAILER_TEMPLATES_${kind}`] = `http://edge-realtime:8081/${file}.html`;
    }
  }
  if (name === "storage") {
    service.environment.FILE_SIZE_LIMIT = "5242880";
    // Only the selected manual probe can run; Auth mail goes to one transport at a time.
    const script = resendTest ? "provision-resend-test-resident.mjs" : "smoke-synthetic-auth.mjs";
    if (resendTest) service.environment.PULONG_RESEND_TEST_EMAIL = reference("RESEND_TEST_EMAIL");
    mount(service, resendTest ? "resend-test-resident" : "synthetic-auth-smoke", `/opt/pulong/${script}`, await readFile(new URL(script, import.meta.url), "utf8"));
  }
  model.services[name] = service;
}));

model.services.mailpit = { image: "axllent/mailpit:v1.28.0", restart: "unless-stopped", environment: { MP_MAX_MESSAGES: "100" } };
const edge = model.services["edge-realtime"] = { image: "nginx:1.29.3-alpine", restart: "unless-stopped", expose: ["8080"], depends_on: { "api-gw": { condition: "service_healthy" } } };
mount(edge, "realtime-gateway", "/etc/nginx/conf.d/default.conf", `server {
  listen 8080;
  access_log off;
  location = /realtime/v1/websocket {
    if ($http_origin != "${appOrigin}") { return 403; }
    if ($http_upgrade != "websocket") { return 426; }
    proxy_pass http://api-gw:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 75s;
  }
  location / { return 404; }
}
server {
  listen 8081;
  access_log off;
  root /srv/auth-templates;
  location / { try_files $uri =404; }
}
`);
for (const file of ["magic-link", "confirmation", "invite", "recovery"]) {
  mount(edge, `auth-${file}`, `/srv/auth-templates/${file}.html`, git("show", `${revision}:ops/supabase/templates/${file}.html`));
}

const migrator = model.services.migrate = {
  image: "node:24.16.0-bookworm-slim", restart: "no", working_dir: "/tugon", environment: { PGPASSWORD: replacements.POSTGRES_PASSWORD },
  depends_on: Object.fromEntries(["db", "auth", "rest", "realtime", "storage"].map((name) => [name, { condition: "service_healthy" }])),
  // The Postgres DSN must not appear in Coolify's Compose or task logs.
  command: ["sh", "-ec", 'if npx --yes supabase@2.113.0 db push --db-url "postgresql://postgres:$$PGPASSWORD@db:5432/postgres?sslmode=disable" >/tmp/migrate.log 2>&1; then echo "Munti Report migrations applied"; else echo "Munti Report migrations failed; inspect locally without printing the DSN" >&2; exit 1; fi'],
};
mount(migrator, "migration-config", "/tugon/supabase/config.toml", 'project_id = "pulong-synthetic"\n[db]\nmajor_version = 17\n[db.seed]\nenabled = false\n');
const files = git("ls-tree", "-r", "--name-only", revision, "supabase/migrations").trim().split("\n");
if (!files.length || files.some((path) => !/^supabase\/migrations\/\d{14}_[a-z_]+\.sql$/u.test(path))) throw new Error("Unexpected migration inventory");
for (const path of files) mount(migrator, `migration-${path.split("/").at(-1).slice(0, 14)}`, `/tugon/${path}`, git("show", `${revision}:${path}`));
console.log(JSON.stringify(model));
