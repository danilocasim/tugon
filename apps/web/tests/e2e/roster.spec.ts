import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { join } from "node:path";
import sharp from "sharp";
import { addDays, manilaDate, slotAt } from "../../src/lib/duty";

import { authenticatorCode, localServices, staffAccount, staffSignIn } from "./local-staff";
import { expectPortalShell } from "./portal-shell";

test("verified staff roster at phone and desktop and own Tanod schedule", async ({ page, browser }) => {
  test.setTimeout(75_000);
  const { admin, db } = localServices();
  const email = `supervisor-${randomUUID()}@example.com`;
  const password = randomUUID();
  const phone = "+639000000041";
  const today = manilaDate(Date.now());
  const officerName = "Pilot Roster Officer";
  const dispatchRef = `TGN-DSP-${randomUUID().slice(0, 8)}`;
  const task = `Inspect the synthetic pilot location near the covered court (${dispatchRef}).`;
  const caseId = randomUUID();
  const report = "Field officer verified that the pilot inspection location was clear.";
  await db.connect();
  let supervisor: string;
  try {
    const employee = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!employee.data.user) throw new Error(`Could not provision synthetic supervisor (${employee.error?.code})`);
    supervisor = employee.data.user.id;
    await db.query("insert into public.memberships(user_id,role,name,title) values ($1,'supervisor','Pilot Supervisor','Supervisor')", [supervisor]);
    const { rows } = await db.query<{ user_id: string }>("select user_id from public.memberships where role='tanod' and phone=$1 and name=$2", [phone, officerName]);
    let officer = rows[0]?.user_id;
    if (!officer) {
      const res = await admin.auth.admin.createUser({ phone, phone_confirm: true });
      if (!res.data.user) throw new Error(`Could not provision isolated SMS fixture (${res.error?.code})`);
      officer = res.data.user.id;
      await db.query("insert into public.memberships(user_id,role,name,title,zone,phone) values ($1,'tanod',$2,'Tanod','P2',$3)", [officer, officerName, phone]);
    }
    await db.query("insert into public.duty_roster(officer_id,local_date,shift) values ($1,$2,'day'), ($1,$3,'night'), ($1,$4,'night') on conflict do nothing", [officer, today, addDays(today, 1), addDays(today, 7)]);
    await db.query("delete from public.duty_roster where officer_id = $1 and local_date = $2 and shift = 'night'", [officer, today]);
    const slot = slotAt(Date.now());
    if (slot.date !== today || slot.shift === "day") await db.query("insert into public.duty_roster(officer_id,local_date,shift) values ($1,$2,$3) on conflict do nothing", [officer, slot.date, slot.shift]);
    await db.query("insert into public.service_requests(id,ref,channel,description,category,status) values($1,$2,'walkin',$3,'infra','queued')", [caseId, dispatchRef, task]);
    await db.query("insert into public.case_work(request_id,team_id,urgency,triaged_at,triaged_by) values($1,'t_works','normal',now(),$2)", [caseId, supervisor]);
  } finally {
    await db.end();
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/barangay/tanods");
  await expect(page).toHaveURL(/\/barangay\/signin/u);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  const secret = await page.locator("code").innerText();
  const firstFactor = await page.context().newPage();
  try {
    await firstFactor.goto("/barangay/tanods");
    await expect(firstFactor).toHaveURL(/\/barangay\/signin/u);
    await expect(firstFactor.getByRole("heading", { name: "Duty roster" })).toHaveCount(0);
  } finally { await firstFactor.close(); }
  await page.getByLabel("Authenticator code").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/barangay\/tanods$/u);
  const roster = page.getByRole("region", { name: /Duty roster/u });
  await expect(roster.getByRole("group", { name: "Roster date" })).toBeVisible();
  await expect(roster.getByRole("table")).toBeHidden();
  await page.getByRole("button", { name: "Edit Night shift" }).click();
  const checkbox = page.getByRole("checkbox", { name: officerName });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(roster.getByRole("region", { name: "Night" }).getByText(officerName)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Call ${officerName}`, "u") }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const capture = process.env.TUGON_CAPTURE;
  if (capture) {
    await page.setViewportSize({ width: 390, height: 844 });
    await roster.screenshot({ path: join(capture, "local-staff-roster-390.png"), animations: "disabled" });
    await page.getByRole("region", { name: /^Officers/u }).screenshot({ path: join(capture, "local-staff-directory-390.png"), animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(roster.getByRole("table")).toBeVisible();

  const field = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const mobile = await field.newPage();
    await mobile.goto("/tanod/schedule");
    await expect(mobile).toHaveURL(/\/tanod\/signin/u);
    await mobile.getByRole("button", { name: "English" }).click();
    await mobile.getByLabel("Mobile number").fill(phone);
    await mobile.getByRole("button", { name: "Continue" }).click();
    const code = mobile.getByLabel("6-digit code");
    await code.fill("141628");
    await mobile.getByRole("button", { name: "Sign in" }).click();
    await expect(mobile.getByRole("alert").filter({ hasText: "The code wasn't accepted" })).toBeVisible();
    await code.fill("041628");
    await mobile.getByRole("button", { name: "Sign in" }).click();
    await expect(mobile.getByRole("heading", { name: "Duty schedule" })).toBeVisible();
    await expect(mobile.getByRole("heading", { name: "Next week" })).toBeVisible();
    await expect(mobile.getByRole("link", { name: "Schedule" })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    if (capture) await mobile.screenshot({ path: join(capture, "local-tanod-schedule-390.png"), animations: "disabled", fullPage: true });
    const fieldAccount = mobile.getByRole("button", { name: officerName, exact: true });
    await fieldAccount.press("Enter");
    await expect(mobile.getByRole("menuitemradio", { name: "Filipino" })).toBeFocused();
    await mobile.keyboard.press("Enter");
    await expect(mobile.getByRole("heading", { name: "Iskedyul ng duty" })).toBeVisible();
    for (const width of [320, 390, 768]) {
      await mobile.setViewportSize({ width, height: 844 });
      await expect.poll(() => mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    await mobile.setViewportSize({ width: 390, height: 844 });
    await fieldAccount.press("Enter");
    await mobile.keyboard.press("ArrowDown");
    await expect(mobile.getByRole("menuitemradio", { name: "English" })).toBeFocused();
    await mobile.keyboard.press("Enter");
    await expect(mobile.getByRole("heading", { name: "Duty schedule" })).toBeVisible();
    await expectPortalShell(mobile, { root: "/tanod", landing: "/tanod", navigation: "Tanod", current: /^Now$/u, secondary: /^Schedule$/u });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/barangay/cases/${caseId}`);
    await page.getByRole("button", { name: "Send a tanod", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Send a tanod" });
    await expect(dialog.getByText(officerName)).toBeVisible();
    await dialog.getByRole("button", { name: "Send Pilot", exact: true }).click();
    await expect(page.getByText("Waiting to accept", { exact: true }).filter({ visible: true })).toBeVisible();
    await mobile.reload();
    const card = mobile.locator("article").filter({ hasText: task });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(mobile).toHaveURL(/\/tanod\/a\/[0-9a-f-]+$/u);
    const assignmentId = new URL(mobile.url()).pathname.split("/").at(-1);
    const fieldPhoto = `/api/field-photo/${assignmentId}?portal=tanod`;
    expect((await mobile.request.get(fieldPhoto)).status()).toBe(404);
    await mobile.getByRole("button", { name: "I've arrived" }).click();
    await mobile.getByRole("button", { name: "File report" }).click();
    await mobile.getByRole("radio", { name: "Handled on site" }).click();
    await mobile.getByRole("textbox").fill(report);
    const image = await sharp({ create: { width: 42, height: 30, channels: 3, background: "#bacee9" } }).jpeg().toBuffer();
    await mobile.getByLabel("Add a photo").setInputFiles({ name: "field.jpg", mimeType: "image/jpeg", buffer: image });
    await expect(mobile.getByRole("button", { name: "Replace", exact: true })).toBeVisible();
    await mobile.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText(report, { exact: true }).filter({ visible: true })).toBeVisible();
    const source = await mobile.request.get(fieldPhoto);
    expect(source.status()).toBe(200);
    await page.getByRole("button", { name: "Start work", exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Record outcome", exact: true }).filter({ visible: true }).click();
    await page.getByLabel("Outcome (resident sees this)").fill("The desk reviewed the field report and approved the outcome.");
    await page.getByRole("button", { name: "Use field photo 1", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Outcome the resident sees" })).toBeVisible();
    const linked = await page.request.get(`/api/photo/${caseId}?portal=staff&kind=outcome`);
    expect(linked.status()).toBe(200);
    expect(await linked.body()).toEqual(await source.body());
    await mobile.goto("/barangay/tanods");
    await expect(mobile).toHaveURL(/\/barangay\/signin/u);
    await page.goto("/barangay/tanods");
    const row = page.getByRole("region", { name: /^Officers/u }).getByRole("listitem").filter({ hasText: officerName });
    await row.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate", exact: true }).click();
    const reactivate = row.getByRole("button", { name: "Reactivate", exact: true });
    await expect(reactivate).toBeVisible();
    try {
      await mobile.goto("/tanod/schedule");
      await expect(mobile).toHaveURL(/\/tanod\/signin/u);
      expect((await mobile.request.get(fieldPhoto)).status()).toBe(404);
    } finally {
      await reactivate.click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Reactivate", exact: true }).click();
      await expect(row.getByRole("button", { name: "Deactivate", exact: true })).toBeVisible();
    }
  } finally { await field.close(); }
});

test("phone-width handlers can consult but not edit the duty roster", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await staffSignIn(page, await staffAccount("handler", "t_works"), "/barangay/tanods");
  const roster = page.getByRole("region", { name: /Duty roster/u });
  await expect(roster.getByRole("group", { name: "Roster date" })).toBeVisible();
  await expect(roster.getByRole("table")).toBeHidden();
  await expect(roster.getByRole("button", { name: /Edit .* shift|Copy last week/u })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expectPortalShell(page, {
    root: "/barangay", landing: "/barangay/queue", navigation: "Staff", current: /^(Work )?queue\b/iu, secondary: /^(Mine|My cases)\b/u, forbidden: /^Admin/u,
  });

  await page.goto("/barangay/tanods");
  const account = page.getByRole("button", { name: "Account", exact: true });
  await account.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio", { name: "Filipino" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(account).toBeFocused();
  const dates = page.getByRole("group", { name: "Petsa ng duty" });
  await expect(dates).toBeVisible();
  const picked = dates.getByRole("button", { pressed: false }).first();
  const pickedLabel = await picked.getAttribute("aria-label");
  if (!pickedLabel) throw new Error("Roster date has no accessible name");
  await picked.press("Space");
  await expect(dates.getByRole("button", { name: pickedLabel })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: pickedLabel, exact: true })).toHaveAttribute("aria-live", "polite");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});
