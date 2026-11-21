import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localServices, staffAccount, staffSignIn } from "./local-staff";

test("staff assisted intake does not carry SMS consent to a changed number", async ({ page }) => {
  const staff = await staffAccount("supervisor");
  const description = `Synthetic concern about broken street lighting at the gate ${randomUUID()}.`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await staffSignIn(page, staff, "/barangay/intake/new");
  await page.getByRole("radio", { name: "Phone call" }).click();
  const number = page.getByLabel("Callback number · optional");
  await number.fill("0900 000 0082");
  const optIn = page.getByRole("checkbox", { name: /Text them status updates/u });
  await expect(optIn).not.toBeChecked();
  await optIn.check();
  await number.fill("0900 000 0083");
  await expect(optIn).not.toBeChecked();
  await page.getByLabel("What they reported").fill(description);
  await expect(page.getByRole("heading", { name: "Live suggestion preview" })).toBeVisible();
  await page.getByRole("button", { name: "Record request", exact: true }).click();
  await expect(page).toHaveURL(/\/barangay\/inbox\?id=[\da-f-]+$/u);
  const id = new URL(page.url()).searchParams.get("id");
  const { db } = localServices();
  await db.connect();
  try {
    const { rows } = await db.query("select r.channel,r.description,w.contact_phone,w.contact_opt_in, (select count(*)::int from tugon_private.delivery_outbox o where o.request_id=r.id) as jobs from public.service_requests r join public.case_work w on w.request_id=r.id where r.id=$1", [id]);
    expect(rows).toEqual([{ channel: "phone", description, contact_phone: "09000000083", contact_opt_in: false, jobs: 0 }]);
  } finally { await db.end(); }
});
