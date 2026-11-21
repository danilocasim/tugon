import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signUp } from "./local-resident";
import { localServices, staffAccount, staffSignIn } from "./local-staff";

test("incident notices render for residents and closure leaves intake reports open", async ({ page, browser, request }) => {
  test.setTimeout(75_000);
  const staff = await staffAccount("supervisor");
  const { db } = localServices();
  const refs = Array.from({ length: 3 }, () => randomUUID());
  const title = `Synthetic incident ${randomUUID().slice(0, 8)}`;
  const residentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await db.connect();
  try {
    const resident = await residentContext.newPage();
    const email = await signUp(resident, request, "/resident/signin");
    await expect(resident).toHaveURL(/\/resident$/u);
    const owner = (await db.query<{ id: string }>("select id from auth.users where email=$1", [email])).rows[0].id;
    const actor = (await db.query<{ id: string }>("select id from auth.users where email=$1", [staff.email])).rows[0].id;
    for (const [i, id] of refs.entries()) {
      await db.query("insert into public.service_requests(id,ref,channel,description,category,status,location,resident_id) values($1,$2,$3,'Synthetic storm drainage report','sanitation',$4,$5,$6)",
        [id, `INCIDENT-TEST-${id}`, i === 1 ? "online" : "walkin", i === 0 ? "queued" : "received", { lat: 14.3741 + i * 0.00005, lon: 121.0314, method: "pin", purok: "P1" }, i === 1 ? owner : null]);
      await db.query("insert into public.case_work(request_id,team_id,assignee_id,urgency) values($1,'t_health',$2,'normal')", [id, i === 0 ? actor : null]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
    await staffSignIn(page, staff, `/barangay/cases/${refs[1]}`);
    await page.getByRole("button", { name: "Start incident", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Start an incident" });
    await create.getByLabel("Title staff will see").fill(title);
    for (const checkbox of await create.getByRole("checkbox").all()) {
      const caseRef = await checkbox.innerText();
      if (!refs.some((id) => caseRef.includes(id))) await checkbox.click();
    }
    await create.getByRole("button", { name: "Start incident" }).click();
    const heading = page.getByRole("heading", { name: title, exact: true });
    const closeAction = page.getByRole("button", { name: "Close incident", exact: true });
    await expect(heading).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const titleBox = await heading.boundingBox();
      const actionBox = await closeAction.boundingBox();
      if (!titleBox || !actionBox) throw new Error("Incident heading and close action must be visible");
      expect(actionBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
      expect(actionBox.x).toBeCloseTo(titleBox.x, 0);
    }
    const notice = "The barangay is clearing the drainage; take a different path while work is ongoing.";
    await page.getByLabel("Public incident update").fill(notice);
    await page.getByRole("button", { name: "Review update" }).click();
    const preview = page.getByRole("dialog", { name: "Review incident update" });
    await expect(preview.getByText(notice)).toBeVisible();
    await expect(preview.getByText(/3 open report timelines/u)).toBeVisible();
    await preview.getByRole("button", { name: "Post update" }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByText(notice, { exact: true }).first()).toBeVisible();
    await resident.route("https://tiles.openfreemap.org/**", (route) => route.abort());
    await resident.goto(`/resident/requests/${refs[1]}`);
    await expect(resident.getByText("Incident update", { exact: true })).toBeVisible();
    await expect(resident.getByText(notice, { exact: true })).toBeVisible();
    await closeAction.click();
    const close = page.getByRole("dialog");
    await close.getByLabel("Incident outcome").fill("The drainage has been cleared and the affected route is open again.");
    await close.getByRole("button", { name: "Close and notify" }).click();
    await expect(close).toBeHidden();
    const result = await db.query<{ id: string; status: string }>("select id,status from public.service_requests where id=any($1::uuid[])", [refs]);
    expect(result.rows.find((r) => r.id === refs[0])?.status).toBe("resolved");
    expect(result.rows.filter((r) => ["received", "review", "needs_info"].includes(r.status))).toHaveLength(2);
  } finally { await residentContext.close(); await db.end(); }
});

test("Insights includes resolved reports and can start an incident outside the latest 250 cases", async ({ page }) => {
  test.setTimeout(70_000);
  const staff = await staffAccount("supervisor");
  const { db } = localServices();
  const refs = Array.from({ length: 4 }, () => `SYNTH-HOTSPOT-${randomUUID().slice(0, 8)}`);
  const distractors = refs[0] + "-later-";
  let incidentId: string | undefined;
  const title = `${refs[0]} linked reports`;
  await db.connect();
  try {
    await db.query(`insert into public.service_requests(ref,channel,description,category,status,created_at,updated_at,closed_at)
      select $1||n,'walkin','Synthetic unrelated archived case','documents','resolved',now()-interval '32 days',now()-interval '1 hour',now()-interval '31 days'
      from generate_series(1,250) n`, [distractors]);
    for (const [i, ref] of refs.entries()) {
      await db.query(`insert into public.service_requests(ref,channel,description,category,status,location,created_at,updated_at,closed_at)
        values($1,'walkin','Synthetic hotspot case','sanitation',$2,$3,now()-interval '2 days',$4,case when $2='resolved' then now()-interval '1 day' end)`,
      [ref, i === 3 ? "resolved" : "received", { lat: 14.3897, lon: 121.0513 - i * 0.00005, method: "pin", purok: "P3" }, i === 0 ? new Date() : new Date(Date.now() - 86_400_000)]);
    }
    await db.query("insert into public.case_work(request_id,contact_name) select id,'Synthetic Walk-in Reporter' from public.service_requests where ref=$1", [refs[0]]);
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
    await staffSignIn(page, staff, "/barangay/insights");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const csv = await readFile((await (await downloaded).path())!, "utf8");
    expect(csv).toMatch(/"median_resolution_hours","","\d+\.\d+"/u);
    const cluster = page.getByRole("button", { name: /near Purok 3 Block 4/u });
    await expect(cluster).toHaveText(/^4/u);
    await cluster.click();
    await page.getByRole("button", { name: "Start an incident from 3 open reports" }).click();
    const dialog = page.getByRole("dialog", { name: "Start an incident" });
    for (const ref of refs.slice(0, 3)) await expect(dialog.getByRole("checkbox", { name: new RegExp(ref, "u") })).toBeChecked();
    await expect(dialog.getByRole("checkbox")).toHaveCount(3);
    const recent = dialog.getByRole("checkbox", { name: new RegExp(refs[0], "u") });
    await expect(recent.getByText("Synthetic hotspot case", { exact: true })).toBeVisible();
    await expect(recent.getByText("Synthetic Walk-in Reporter", { exact: true })).toBeVisible();
    await dialog.getByLabel("Title staff will see").fill(title);
    await dialog.getByRole("button", { name: "Start incident" }).click();
    await expect(page).toHaveURL(/\/barangay\/incidents\/[0-9a-f-]+$/u);
    incidentId = new URL(page.url()).pathname.split("/").at(-1);
    await expect(page.getByRole("heading", { name: "Linked reports 3" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review update" })).toBeDisabled();
    await page.getByLabel("Public incident update").fill("Crews are responding to the synthetic local fixture.");
    await page.getByRole("button", { name: "Review update" }).click();
    await expect(page.getByRole("dialog").getByText(/3 open report timelines/u)).toBeVisible();
  } finally {
    await db.query("delete from public.service_requests where ref like $1", [`${distractors}%`]);
    await db.query("delete from public.service_requests where ref=any($1::text[])", [refs]);
    if (incidentId) await db.query("delete from public.incidents where id=$1 and title=$2", [incidentId, title]);
    await db.end();
  }
});
