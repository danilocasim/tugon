import { createHmac, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export function localServices() {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key, DATABASE_URL: connectionString } = process.env;
  if (!url || new URL(url).origin !== "http://127.0.0.1:56321" || !key || !connectionString || new URL(connectionString).port !== "56322" || !["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname)) throw new Error("Use the isolated Supabase test harness");
  return { admin: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }), db: new pg.Client({ connectionString }) };
}

export function authenticatorCode(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = Buffer.from((secret.toUpperCase().replace(/=+$/u, "").split("").map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("").match(/.{8}/gu) ?? []).map((s) => Number.parseInt(s, 2)));
  const step = Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", bytes).update(step).digest();
  return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fff_ffff) % 1_000_000).padStart(6, "0");
}

export async function staffAccount(role: "supervisor" | "handler" | "admin", team: string | null = null) {
  const { admin, db } = localServices();
  const email = `${role}-${randomUUID()}@example.com`;
  const password = randomUUID();
  const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!res.data.user) throw new Error(`Could not provision local staff fixture (${res.error?.code})`);
  await db.connect();
  try { await db.query("insert into public.memberships(user_id,role,name,team_id) values ($1,$2,$3,$4)", [res.data.user.id, role, `Pilot ${role}`, team]); }
  finally { await db.end(); }
  return { email, password };
}

export async function staffSignIn(page: Page, account: { email: string; password: string }, destination: string) {
  await page.goto(destination);
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  const secret = await page.locator("code").innerText();
  await page.getByLabel("Authenticator code").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(destination);
  return secret;
}
