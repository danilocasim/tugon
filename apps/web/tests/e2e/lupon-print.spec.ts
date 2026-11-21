import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { localServices, staffAccount, staffSignIn } from "./local-staff";

// Feature on for this test's disposable fixtures only. The advisory lock is
// held across the browser interaction, and the original setting is restored.
test("only eligible Lupon document types print in the authorized staff portal", async ({ page, browser }) => {
  test.setTimeout(75_000);
  const account = await staffAccount("supervisor");
  const unauthorized = await staffAccount("handler", "t_works");
  const { db } = localServices();
  await db.connect();
  let previous: boolean | undefined;
  try {
    await db.query("select pg_advisory_lock(hashtext('tugon:local-lupon-print-test'))");
    previous = (await db.query<{ lupon_enabled: boolean }>("select lupon_enabled from public.civic_settings where singleton")).rows[0].lupon_enabled;
    const staff = (await db.query<{ id: string }>("select id from auth.users where email=$1", [account.email])).rows[0].id;
    const docs: { stage: "mediation" | "settled" | "cfa"; kp: string; hearing: string }[] = [];
    for (const stage of ["mediation", "settled", "cfa"] as const) {
      const request = randomUUID(), kp = randomUUID(), hearing = randomUUID();
      await db.query("insert into public.service_requests(id,ref,channel,description,category,status) values($1,$2,'walkin','Synthetic private request','peace','in_progress')", [request, `SYNTH-KP-${request}`]);
      await db.query("insert into public.case_work(request_id,team_id,urgency,assignee_id) values($1,'t_peace','normal',$2)", [request, staff]);
      await db.query("insert into public.lupon_cases(id,number,request_id,complainant,respondent,respondent_address,nature,filed_by,stage,settlement,settlement_at,closed_at) values($1,$2,$3,'Synthetic Party A','Synthetic Party B','Fictional place','Synthetic civil dispute',$4,$5,case when $5='settled' then 'Both parties agreed on a synthetic settlement for testing.' end,case when $5='settled' then now() end,case when $5<>'mediation' then now() end)", [kp, `KP-SYNTH-${kp.slice(0, 8)}`, request, staff, stage]);
      await db.query("insert into public.lupon_hearings(id,case_id,kind,at,summons_served,result) values($1,$2,'mediation',now(),true,case when $3='cfa' then 'respondent_absent' when $3='settled' then 'settled' end)", [hearing, kp, stage]);
      docs.push({ stage, kp, hearing });
    }
    await db.query("update public.civic_settings set lupon_enabled=true where singleton");
    await staffSignIn(page, account, "/barangay/lupon");
    await expect(page.getByRole("heading", { name: "Lupon docket", exact: true })).toBeVisible();
    const capture = process.env.TUGON_CAPTURE;
    for (const { stage, kp, hearing } of docs) {
      const doc = stage === "mediation" ? "summons" : stage === "settled" ? "settlement" : "cfa";
      await page.goto(`/barangay/lupon/${kp}/print?doc=${doc}&hearing=${hearing}`);
      await expect(page.getByText("Draft · not an official Lupon form", { exact: true })).toBeVisible();
      await expect(page.getByText(/Synthetic Party A/u).first()).toBeVisible();
      await page.emulateMedia({ media: "print" });
      await expect(page.getByRole("navigation", { name: "Staff", exact: true })).toHaveCount(0);
      const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, path: capture ? join(capture, `local-lupon-${doc}-a4.pdf`) : undefined });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      await page.emulateMedia({ media: "screen" });
    }
    await db.query("update public.lupon_cases set stage='conciliation',conciliation_start=now() where id=$1", [docs[0].kp]);
    await db.query("insert into public.lupon_hearings(case_id,kind,at) values($1,'conciliation',now())", [docs[0].kp]);
    await page.goto(`/barangay/lupon/${docs[0].kp}`);
    await expect(page.getByText("Not held · case moved to the next stage")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record result" })).toHaveCount(1);
    const closedDoc = docs.find((d) => d.stage === "cfa")!;
    await page.goto(`/barangay/lupon/${docs[0].kp}/print?doc=cfa`);
    await expect(page.getByText("No certificate issued for this case")).toBeVisible();
    const context = await browser.newContext();
    try {
      const other = await context.newPage();
      await staffSignIn(other, unauthorized, "/barangay/queue");
      await other.goto(`/barangay/lupon/${closedDoc.kp}/print?doc=cfa`);
      await expect(other).toHaveURL(/\/barangay\/tanods$/u);
      await expect(other.getByText("Synthetic Party A", { exact: true })).toHaveCount(0);
    } finally { await context.close(); }
  } finally {
    if (previous !== undefined) await db.query("update public.civic_settings set lupon_enabled=$1 where singleton", [previous]);
    await db.end();
  }
});
