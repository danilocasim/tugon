import { randomInt, randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { authenticatorCode, localServices, staffAccount, staffSignIn } from "./local-staff";

async function mailLink(request: APIRequestContext, address: string, kind: "invite" | "recovery") {
  const inbox = process.env.TUGON_TEST_MAILPIT;
  if (!inbox || new URL(inbox).port !== "56324") throw new Error("Use isolated Mailpit");
  let callback: string | undefined;
  await expect.poll(async () => {
    const search = await request.get(`${inbox}/api/v1/search`, { params: { query: `to:${address}` } });
    if (!search.ok()) throw new Error("Local inbox is unavailable");
    const { messages } = await search.json() as { messages?: { ID: string }[] };
    for (const row of messages ?? []) {
      const response = await request.get(`${inbox}/api/v1/message/${row.ID}`);
      if (!response.ok()) continue;
      const { HTML } = await response.json() as { HTML: string };
      const matched = HTML?.match(new RegExp(`href="(http://localhost:3100/auth/callback\\?[^" ]+&amp;type=${kind})"`, "u"));
      if (matched) { callback = matched[1].replaceAll("&amp;", "&"); break; }
    }
    return !!callback;
  }).toBe(true);
  const url = new URL(callback!);
  return url.pathname + url.search;
}

async function prefetchLink(request: APIRequestContext, url: string) {
  const response = await request.get(url, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  // HEAD requests also must not spend the token.
  expect((await request.head(url, { maxRedirects: 0 })).status()).toBe(200);
  const otherSite = await request.post("/auth/callback", {
    headers: { origin: "https://other.example.test" },
    form: Object.fromEntries(new URLSearchParams(url.slice(url.indexOf("?") + 1))),
    maxRedirects: 0,
  });
  expect(otherSite.status()).toBe(403);
}

test("administrator invites using GoTrue mail and cannot search restricted case data", async ({ page, browser, request }) => {
  test.setTimeout(70_000);
  const account = await staffAccount("admin");
  const invited = `staff-${randomUUID()}@example.com`;
  const password = randomUUID();
  const title = `Restricted operational subject ${randomUUID()}`;
  const { db } = localServices();
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string }>("insert into public.service_requests(ref,channel,description) values($1,'walkin',$2) returning id", [`TEST-OPS-${randomUUID()}`, title]);
    await db.query("insert into public.case_work(request_id,restricted) values($1,true)", [rows[0].id]);
  } finally { await db.end(); }
  await page.setViewportSize({ width: 390, height: 844 });
  await staffSignIn(page, account, "/barangay/admin");
  const nav = page.getByRole("navigation", { name: "Administration sections" });
  for (const tab of ["targets", "referrals", "sms", "privacy", "audit", "staff"]) {
    await page.goto(`/barangay/admin?tab=${tab}`);
    await expect(page.getByRole("heading", { name: "Administration", exact: true })).toBeVisible();
    await expect(nav.locator(`a[href$="tab=${tab}"]`)).toHaveAttribute("aria-current", "page");
  }
  await page.keyboard.press("/");
  const finder = page.getByRole("dialog", { name: "Search Munti Report" });
  const search = finder.getByRole("combobox");
  await expect(search).toBeFocused();
  await search.fill(title);
  await expect(finder.getByText(/No matches for/u)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(finder).toBeHidden();
  await page.getByRole("button", { name: "Invite staff", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invite staff" });
  await dialog.getByLabel("Full name").fill("Synthetic Invited Handler");
  await dialog.getByLabel("Work email").fill(invited);
  await dialog.getByLabel("Team").selectOption("t_works");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog).toBeHidden();
  const invite = await mailLink(request, invited, "invite");
  await prefetchLink(request, invite);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const incoming = await context.newPage();
    await incoming.goto(invite);
    await expect(incoming.getByRole("heading", { name: "Accept your staff invitation" })).toBeVisible();
    await incoming.getByRole("button", { name: "Continue / Magpatuloy" }).click();
    await expect(incoming.getByRole("heading", { name: "Set your staff password" })).toBeVisible();
    await incoming.getByLabel("Password", { exact: true }).fill(password);
    await incoming.getByRole("button", { name: "Save password" }).click();
    await expect(incoming.getByRole("heading", { name: "Sign in to Munti Report" })).toBeVisible();
    const factorSecret = await staffSignIn(incoming, { email: invited, password }, "/barangay/queue");
    const recoveryContext = await browser.newContext();
    try {
      const recovery = await recoveryContext.newPage();
      await recovery.goto("/barangay/signin");
      await recovery.getByRole("button", { name: "Forgot your password?" }).click();
      await recovery.getByLabel("Work email").fill(invited);
      await recovery.getByRole("button", { name: "Send reset email" }).click();
      const link = await mailLink(request, invited, "recovery");
      await prefetchLink(request, link);
      await recovery.goto(link);
      await expect(recovery.getByRole("heading", { name: "Reset your staff password" })).toBeVisible();
      await recovery.getByRole("button", { name: "Continue / Magpatuloy" }).click();
      await expect(recovery.getByRole("heading", { name: "Set your staff password" })).toBeVisible();
      const changed = randomUUID();
      await recovery.getByLabel("Password", { exact: true }).fill(changed);
      await recovery.getByLabel("Authenticator code").fill(authenticatorCode(factorSecret));
      await recovery.getByRole("button", { name: "Save password" }).click();
      await expect(recovery.getByRole("heading", { name: "Sign in to Munti Report" })).toBeVisible();
      await recovery.getByLabel("Work email").fill(invited);
      await recovery.getByLabel("Password", { exact: true }).fill(changed);
      await recovery.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(recovery.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
      await expect(recovery.locator("code")).toHaveCount(0);
      await recovery.getByLabel("Authenticator code").fill(authenticatorCode(factorSecret));
      await recovery.getByRole("button", { name: "Verify and sign in" }).click();
      await expect(recovery).toHaveURL(/\/barangay\/queue$/u);
      const entry = page.locator("section > div").filter({ has: page.getByText(invited, { exact: true }) });
      await entry.getByRole("button", { name: "Manage Synthetic Invited Handler" }).click();
      const membership = page.getByRole("dialog", { name: "Synthetic Invited Handler" });
      await membership.getByLabel("Role").selectOption("intake");
      await membership.getByRole("button", { name: "Save", exact: true }).click();
      await expect(membership).toBeHidden();
      await expect(entry.getByText("Intake", { exact: false })).toBeVisible();
      await recovery.goto("/barangay/queue");
      await expect(recovery).toHaveURL(/\/barangay\/signin/u);
    } finally { await recoveryContext.close(); }
    const second = await browser.newContext();
    try {
      const replay = await second.newPage();
      await replay.goto(invite);
      await replay.getByRole("button", { name: "Continue / Magpatuloy" }).click();
      await expect(replay.getByRole("alert").filter({ hasText: "Open a new invitation" })).toBeVisible();
    } finally { await second.close(); }
  } finally { await context.close(); }
});

test("supervisor sees insights and monthly report without shell chrome in A4 print", async ({ page }) => {
  test.setTimeout(60_000);
  const account = await staffAccount("supervisor");
  await page.setViewportSize({ width: 390, height: 844 });
  await staffSignIn(page, account, "/barangay/insights");
  await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "K-Means k=3" }).click();
  await expect(page.getByRole("radio", { name: "K-Means k=3" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "7 days" }).click();
  await expect(page.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("tugon-insights-7d.csv");
  await page.getByRole("link", { name: "Monthly report", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Monthly report on resident requests" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Staff", exact: true })).toHaveCount(0);
  const capture = process.env.TUGON_CAPTURE;
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, path: capture ? join(capture, "local-monthly-report-a4.pdf") : undefined });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
});

test("monthly print shows aggregate roster slots from the selected Manila month", async ({ page }) => {
  const account = await staffAccount("supervisor");
  const { db } = localServices();
  const officer = randomUUID();
  const name = `Synthetic roster officer ${officer.slice(0, 8)}`;
  await db.connect();
  try {
    await db.query("insert into auth.users(id) values($1)", [officer]);
    await db.query("insert into public.memberships(user_id,role,name,phone) values($1,'tanod',$2,$3)",
      [officer, name, `+639${randomInt(100_000_000, 1_000_000_000)}`]);
    await db.query(`insert into public.duty_roster(officer_id,local_date,shift) values
      ($1,'2001-03-31','night'),($1,'2001-04-01','day'),($1,'2001-04-01','night'),($1,'2001-04-30','night'),($1,'2001-05-01','day')`, [officer]);
    await page.setViewportSize({ width: 390, height: 844 });
    await staffSignIn(page, account, "/barangay/reports");
    await page.getByRole("combobox", { name: "Month" }).selectOption("2001-04");
    await expect(page).toHaveURL(/month=2001-04$/u);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("row", { name: "Day shifts rostered 1" })).toBeVisible();
    await expect(page.getByRole("row", { name: "Night shifts rostered 2" })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  } finally {
    await db.query("delete from public.duty_roster where officer_id=$1", [officer]);
    await db.query("delete from auth.users where id=$1", [officer]);
    await db.end();
  }
});
