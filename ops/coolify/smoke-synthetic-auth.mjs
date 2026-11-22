import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

// Run inside Munti Report's synthetic Supabase Storage container, not on a public gateway.
const [origin] = process.argv.slice(2);
const { ANON_KEY: anon, SERVICE_KEY: service } = process.env;
const gateway = "http://api-gw:8000";
const mailbox = "http://mailpit:8025/api/v1";
const name = "Synthetic Munti Report Resident";
const email = `synthetic-smoke-${randomUUID()}@example.test`;
const cookieKey = "sb-pulong-supabase-gateway-auth-token";
let phase = "staging preflight";

function requireCheck(condition) {
  if (!condition) throw new Error("Smoke check failed");
}

function request(url, init) {
  return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) });
}

function privateRequest(path, { token = anon, body, method = body ? "POST" : "GET" } = {}) {
  return request(`${gateway}${path}`, {
    method,
    headers: { apikey: token === service ? service : anon, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response, status = 200) {
  requireCheck(response.status === status);
  return response.json();
}
async function run() {
  const hosted = origin === process.env.STORAGE_PUBLIC_URL && /^https:\/\/muntireport(?:\.\d{1,3}){4}\.sslip\.io$/u.test(origin ?? "");
  const syntheticOrigin = hosted || origin === "http://pulong-smoke-web:3000";
  requireCheck(anon && service && syntheticOrigin);
  const auth = await json(await privateRequest("/auth/v1/settings"));
  requireCheck(auth.disable_signup === true && auth.external?.phone === false);
  requireCheck((await request(`${mailbox}/messages`)).ok);
  requireCheck((await json(await request(`${origin}/api/health/ready`))).status === "ready");

  phase = "release flags";
  const flags = "/rest/v1/civic_settings?select=lupon_enabled,retention_enabled&singleton=eq.true";
  const held = (rows) => rows.length === 1 && rows[0].lupon_enabled === false && rows[0].retention_enabled === false;
  requireCheck(held(await json(await privateRequest(flags))));
  for (const path of ["delivery", "retention"]) {
    requireCheck([401, 404].includes((await request(`${origin}/api/jobs/${path}`, { method: "POST" })).status));
  }

  phase = "synthetic user provisioning";
  const user = await json(await privateRequest("/auth/v1/admin/users", { token: service, body: { email, email_confirm: true } }));
  requireCheck(user.email === email && user.email_confirmed_at);
  requireCheck((await privateRequest("/auth/v1/otp", { body: { email, create_user: true } })).ok);

  phase = "private email capture";
  let message;
  for (let attempt = 0; attempt < 12 && !message; attempt++) {
    const { messages } = await json(await request(`${mailbox}/search?query=${encodeURIComponent(`to:${email}`)}`));
    message = messages?.find((item) => item.To.some((address) => address.Address === email));
    if (!message) await setTimeout(250);
  }
  requireCheck(message?.ID);
  const { HTML: html } = await json(await request(`${mailbox}/message/${message.ID}`));
  const code = html?.match(/>\s*(\d{6})\s*<\/p>/u)?.[1];
  requireCheck(code);

  phase = "one-use OTP and resident profile";
  const verify = { type: "email", email, token: code };
  const session = await json(await privateRequest("/auth/v1/verify", { body: verify }));
  requireCheck(session.user?.id === user.id && session.access_token && session.refresh_token);
  requireCheck((await privateRequest("/auth/v1/verify", { body: verify })).status === 403);
  const profile = await privateRequest("/rest/v1/rpc/complete_resident_profile", {
    token: session.access_token, body: { p_name: name, p_purok: "P1", p_lang: "en", p_consented: true },
  });
  requireCheck(profile.ok);

  phase = "ordinary user release flag denial";
  const denied = await privateRequest(flags, { token: session.access_token, method: "PATCH", body: { lupon_enabled: false, retention_enabled: false } });
  requireCheck(denied.status === 403 || (denied.status === 200 && (await denied.json()).length === 0));
  requireCheck(held(await json(await privateRequest(flags))));

  phase = "SSR session refresh and anonymous protection";
  session.expires_at = 1; // Force refresh while keeping the original GoTrue access and refresh tokens.
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const chunks = encoded.match(/.{1,3180}/gu);
  const cookie = chunks.map((chunk, i) => `${cookieKey}${chunks.length === 1 ? "" : `.${i}`}=${chunk}`).join("; ");
  const resident = await request(`${origin}/api/state?portal=resident`, { headers: { cookie } });
  const rotated = resident.headers.getSetCookie().some((entry) => entry.startsWith(cookieKey) && /;\s*Secure/iu.test(entry) && /;\s*HttpOnly/iu.test(entry) && !/Max-Age=0/iu.test(entry));
  requireCheck(rotated && resident.headers.get("cache-control")?.includes("no-store"));
  const snapshot = await json(resident);
  requireCheck(snapshot.me?.id === user.id && snapshot.me?.name === name);
  requireCheck((await request(`${origin}/api/resident/export`)).status === 401);
  console.log("Munti Report synthetic smoke passed: private email, one-use OTP, SSR refresh, anonymous denial and unchanged release flags.");
}

await run().catch(() => {
  console.error(`Munti Report synthetic smoke failed during ${phase}. No response bodies or credentials were logged.`);
  process.exitCode = 1;
});
