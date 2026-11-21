import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

type Mail = { ID: string; To: { Address: string }[] };

async function latestCode(request: APIRequestContext, inbox: string, address: string) {
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${inbox}/api/v1/search`, { params: { query: `to:${address}` } });
    if (!response.ok()) throw new Error(`Local Mailpit search returned ${response.status()}`);
    const { messages } = await response.json() as { messages: Mail[] | null };
    id = messages?.find((message) => message.To.some((item) => item.Address === address))?.ID;
    return !!id;
  }).toBe(true);
  const response = await request.get(`${inbox}/api/v1/message/${id}`);
  expect(response.ok()).toBe(true);
  const mail = await response.json() as { HTML: string };
  const code = mail.HTML.match(/>\s*(\d{6})\s*</u)?.[1];
  if (!code) throw new Error("Local verification email did not contain a six-digit code");
  return code;
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
  const code = await latestCode(request, inbox, email);
  if (verifyErrors) {
    await field.fill(`${code.charAt(0) === "1" ? "2" : "1"}${code.slice(1)}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
  }
  await field.fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Full name").fill("Pilot Resident");
  await page.getByLabel("Purok where you live").selectOption("P1");
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  return email;
}
