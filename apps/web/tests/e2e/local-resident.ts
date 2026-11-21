import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localServices } from "./local-staff";

type Mail = { ID: string; To: { Address: string }[] };

async function latestCode(request: APIRequestContext, inbox: string, address: string, previous?: string) {
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${inbox}/api/v1/search`, { params: { query: `to:${address}` } });
    if (!response.ok()) throw new Error(`Local Mailpit search returned ${response.status()}`);
    const { messages } = await response.json() as { messages: Mail[] | null };
    id = messages?.find((message) => message.ID !== previous && message.To.some((item) => item.Address === address))?.ID;
    return !!id;
  }).toBe(true);
  const response = await request.get(`${inbox}/api/v1/message/${id}`);
  expect(response.ok()).toBe(true);
  const mail = await response.json() as { HTML: string };
  const code = mail.HTML.match(/>\s*(\d{6})\s*</u)?.[1];
  if (!code) throw new Error("Local verification email did not contain a six-digit code");
  return { id, code };
}

export async function signUp(page: Page, request: APIRequestContext, start: string, verifyErrors = false) {
  const inbox = process.env.TUGON_TEST_MAILPIT;
  if (!inbox) throw new Error("Start the local Supabase stack and use ops/with-local-supabase.mjs");
  const email = `resident-${randomUUID()}@example.com`;
  await page.goto(start);
  await page.getByRole("radio", { name: "EN" }).last().click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const field = page.getByLabel("6-digit code from your email");
  await expect(field).toBeVisible();
  let message = await latestCode(request, inbox, email);
  if (verifyErrors) {
    const { code, id } = message;
    await field.fill(`${code.charAt(0) === "1" ? "2" : "1"}${code.slice(1)}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();

    const { db } = localServices();
    await db.connect();
    try {
      // Move the disposable account beyond GoTrue's expiry and resend window.
      const aged = await db.query(
        "update auth.users set confirmation_sent_at = now() - interval '1 day' where email = $1 and email_confirmed_at is null",
        [email],
      );
      expect(aged.rowCount).toBe(1);
    } finally {
      await db.end();
    }
    await field.fill(code);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && !!response.request().headers()["next-action"]),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
    await page.getByRole("button", { name: "Change email" }).click();
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(field).toBeVisible();
    message = await latestCode(request, inbox, email, id);
  }
  await field.fill(message.code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  if (verifyErrors) {
    const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
    if (!url || !key) throw new Error("Start the local Supabase stack and use ops/with-local-supabase.mjs");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const replay = await client.auth.verifyOtp({ email, token: message.code, type: "email" });
    expect(replay.error?.code).toBe("otp_expired");
    expect(replay.data.session).toBeNull();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Full name").fill("Pilot Resident");
  await page.getByLabel("Purok where you live").selectOption("P1");
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  return email;
}
