import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const [program, ...args] = process.argv.slice(2);
if (!program) throw new Error("Usage: node ops/with-local-supabase.mjs <command> [args]");
const repo = fileURLToPath(new URL("../", import.meta.url));
const local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const origin = "http://localhost:3100";
const loopback = (value, port) => {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== port) throw new Error(`Unexpected local Supabase port: ${port}`);
  return value;
};
const child = spawn(program, args, {
  cwd: repo,
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: loopback(local.API_URL, "56321"),
    SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY ?? local.ANON_KEY,
    SUPABASE_SERVICE_KEY: local.SECRET_KEY ?? local.SERVICE_ROLE_KEY,
    DATABASE_URL: loopback(local.DB_URL, "56322"),
    TUGON_SETUP_SECRET: process.env.TUGON_SETUP_SECRET ?? randomBytes(32).toString("base64url"),
    TUGON_JOBS_SECRET: process.env.TUGON_JOBS_SECRET ?? randomBytes(32).toString("base64url"),
    TUGON_TEST_MAILPIT: loopback(local.MAILPIT_URL ?? local.INBUCKET_URL, "56324"),
    TUGON_ORIGIN: origin,
    TUGON_LIVE_DELIVERY: "off",
    TUGON_EMAIL_DELIVERY: "off",
    TUGON_SMS_DELIVERY: "off",
    TUGON_AUTH_SMS_ENABLED: "off",
    TUGON_RETENTION_JOBS: "off",
    TUGON_EVIDENCE_GC: "off",
  },
});
for (const sig of ["SIGTERM", "SIGINT"]) process.once(sig, () => child.kill(sig));
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
