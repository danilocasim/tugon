import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { staffAccount, staffSignIn } from "./local-staff";
import { signUp } from "./local-resident";
import { expectPortalShell } from "./portal-shell";

test("email verification gates resident profile onboarding", async ({ page, request }) => {
  await signUp(page, request, "/resident/signin", true);
  await expect(page).toHaveURL(/\/resident$/u);
  await expect(page.getByRole("heading", { name: /Pilot/ })).toBeVisible();
  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name.startsWith("sb-"));
  expect(sessionCookie?.httpOnly).toBe(true);
  await expectPortalShell(page, { root: "/resident", landing: "/resident", navigation: "Main", current: /^Home$/u, secondary: /^Requests$/u });
  await page.getByRole("link", { name: "Account", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/resident\/account$/u);
  const emailUpdates = page.getByRole("switch", { name: /Email me when there's an update/u });
  await expect(emailUpdates).not.toBeChecked();
  await emailUpdates.press("Space");
  await expect(emailUpdates).toBeChecked();
  await page.reload();
  await expect(emailUpdates).toBeChecked();
});

test("mobile report retries the same receipt and protects its JPEG", async ({ page, browser, request }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await signUp(page, request, "/resident/report?category=infra");
  await expect(page).toHaveURL(/\/resident\/report\?category=infra$/u);
  await expect(page.getByRole("button", { name: "Public works" })).toHaveAttribute("aria-pressed", "true");
  const description = "A streetlight next to the community entrance has stopped working.";
  await page.getByRole("textbox", { name: "What happened, or what do you need?" }).fill(description);
  await page.getByRole("radio", { name: "No", exact: true }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("Location is off. Drop a pin or choose a landmark instead.")).toBeVisible();
  await page.getByLabel("Purok only").selectOption("P1");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const invalid = { name: "invalid.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a JPEG") };
  await page.getByLabel("Choose or take a photo").setInputFiles(invalid);
  await expect(page.getByText("We couldn't read that file. Try a JPG or PNG.")).toBeVisible();
  const photo = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#d5ece0" } }).png().toBuffer();
  await page.getByLabel("Choose or take a photo").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: photo });
  await expect(page.getByRole("img", { name: "Photo attached" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check before sending" })).toBeVisible();
  await page.route("**/resident/report?category=infra", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("We couldn't confirm it was received")).toBeVisible();
  await page.unroute("**/resident/report?category=infra");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Your report was received" })).toBeVisible();
  await expect(page.getByText("It had already arrived — only one report was recorded.")).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const evidence = `/api/resident/evidence/${id}`;
  const saved = await page.request.get(evidence);
  expect(saved.status()).toBe(200);
  expect(saved.headers()["cache-control"]).toContain("no-store");
  expect((await sharp(await saved.body()).metadata()).format).toBe("jpeg");
  await page.getByRole("link", { name: "Track this request" }).click();
  await expect(page).toHaveURL(new RegExp(`/resident/requests/${id}$`, "u"));
  await page.reload();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByRole("img", { name: "Photo attached" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.goto("/resident/requests");
  await expect(page.getByText(description)).toHaveCount(1);

  const outsider = await browser.newContext();
  try {
    const another = await outsider.newPage();
    expect((await another.request.get(evidence)).status()).toBe(404);
    await signUp(another, request, "/resident/signin");
    await expect(another).toHaveURL(/\/resident$/u);
    expect((await another.request.get(evidence)).status()).toBe(404);
    await another.goto(`/resident/requests/${id}`);
    await expect(another.getByText(description)).toHaveCount(0);
  } finally {
    await outsider.close();
  }
});

test("write-first reporting keeps category optional and does not persist a draft body", async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await signUp(page, request, "/resident/report");
  const note = `Synthetic write-first report ${randomUUID()} describes an issue without selecting a category.`;
  await page.getByRole("textbox", { name: "What happened, or what do you need?" }).fill(note);
  await expect(page.getByRole("button", { name: "Not sure", exact: true })).toHaveAttribute("aria-pressed", "true");
  const safe = page.getByRole("radio", { name: "No", exact: true });
  await safe.press("Space");
  await expect(safe).toBeChecked();
  await page.getByRole("button", { name: "Next", exact: true }).press("Enter");
  await page.getByLabel("Purok only").selectOption("P3");
  const persisted = await page.evaluate(() => JSON.stringify({ session: Object.entries(sessionStorage), local: Object.entries(localStorage) }));
  expect(persisted).not.toContain(note);
  await page.getByRole("button", { name: "Next", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Add a photo" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Check before sending" })).toBeVisible();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("heading", { name: "Your report was received" })).toBeVisible();
  await expect(page.getByText("Not sure", { exact: true })).toBeVisible();
});

test("resident report reaches intake and returns a resolution from a different staff team session", async ({ page, browser, request }) => {
  test.setTimeout(80_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await signUp(page, request, "/resident/report?category=documents");
  const summary = `Please advise on a residency certificate for a synthetic pilot record ${randomUUID()}.`;
  await page.getByRole("textbox", { name: "What happened, or what do you need?" }).fill(summary);
  await page.getByRole("radio", { name: "No", exact: true }).check();
  for (const heading of ["Where is it?", "Add a photo", "Check before sending"]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("heading", { name: "Your report was received" })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const staffCase = `/barangay/cases/${id}`;
  const sockets: string[] = [];
  const invalidations: string[] = [];
  page.on("websocket", (socket) => {
    const path = new URL(socket.url()).pathname;
    sockets.push(path);
    if (!path.startsWith("/realtime/")) return;
    socket.on("socketerror", () => sockets.push("socket-error"));
    socket.on("framereceived", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      if (text.includes("changed")) invalidations.push(path);
      if (text.includes("phx_reply")) sockets.push(text.includes('"status":"ok"') ? "reply-ok" : "reply-error");
    });
  });
  await page.goto(`/resident/requests/${id}`);
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  const intake = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const handler = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const desk = await intake.newPage();
    await staffSignIn(desk, await staffAccount("supervisor"), staffCase);
    await expect(desk.getByText(summary)).toBeVisible();
    await desk.getByRole("radio", { name: /^Documents/u }).click();
    await desk.getByLabel("Internal note · optional").fill("Confirmed by intake that this concerns document processing.");
    await desk.getByRole("button", { name: /Send to Records/u }).click();
    await expect(desk.getByRole("heading", { name: "Documents and Certification" })).toBeVisible();

    const worker = await handler.newPage();
    await staffSignIn(worker, await staffAccount("handler", "t_records"), staffCase);
    const actions = worker.getByRole("button", { name: "Claim case", exact: true }).filter({ visible: true });
    await actions.click();
    await worker.getByRole("button", { name: "Start work", exact: true }).filter({ visible: true }).click();
    const catchingUp = "The service desk confirmed the requested document is being prepared.";
    await page.context().setOffline(true);
    try {
      await worker.getByRole("button", { name: "Message resident", exact: true }).click();
      await worker.getByLabel("Message to resident").fill(catchingUp);
      await worker.getByRole("button", { name: "Send to resident", exact: true }).click();
      await expect(worker.getByText(catchingUp, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(catchingUp, { exact: true })).toHaveCount(0);
    } finally { await page.context().setOffline(false); }
    await expect(page.getByText(catchingUp, { exact: true }).first()).toBeVisible();
    await worker.getByRole("button", { name: "Record outcome", exact: true }).filter({ visible: true }).click();
    const outcome = "The resident can pick up the requested certificate at the service desk.";
    await worker.getByLabel("Outcome (resident sees this)").fill(outcome);
    const proof = `/api/photo/${id}?portal=resident&kind=outcome`;
    expect((await page.request.get(proof)).status()).toBe(404);
    const photo = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#eba7a5" } }).jpeg().toBuffer();
    await worker.getByLabel("Upload a proof photo").setInputFiles({ name: "proof.jpg", mimeType: "image/jpeg", buffer: photo });
    await expect(worker.getByRole("button", { name: "Remove uploaded photo" })).toBeVisible();
    await worker.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(worker.getByRole("heading", { name: "Outcome the resident sees" })).toBeVisible();

    await expect.poll(() => invalidations.length, { message: "Expected a database broadcast over the resident socket" }).toBeGreaterThan(0).catch((error) => {
      throw new Error(`Websocket events: ${sockets.join(", ") || "none"}`, { cause: error });
    });
    await expect(page.getByText(outcome, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Confirmed by intake that this concerns document processing.")).toHaveCount(0);
    const committed = await page.request.get(proof);
    expect(committed.status()).toBe(200);
    expect(committed.headers()["cache-control"]).toContain("private");
    expect((await sharp(await committed.body()).metadata()).format).toBe("jpeg");
    const privateExport = await page.request.get("/api/resident/export");
    expect(privateExport.status()).toBe(200);
    expect(privateExport.headers()["content-disposition"]).toContain("tugon-my-data.json");
    expect(privateExport.headers()["cache-control"]).toContain("no-store");
    const body = await privateExport.text();
    expect(body).toContain(outcome);
    expect(body).not.toContain("Confirmed by intake that this concerns document processing.");
    expect((await worker.request.get(proof)).status()).toBe(404);
    expect((await worker.request.get("/api/resident/export")).status()).toBe(401);
    const bootstrap = await page.request.get("/api/realtime?portal=resident");
    expect(bootstrap.status()).toBe(200);
    const { url, key, accessToken, topics } = await bootstrap.json() as { url: string; key: string; accessToken: string; topics: string[] };
    const socket = createClient(url, key, { accessToken: async () => accessToken });
    try {
      await socket.realtime.setAuth(accessToken);
      const join = (topic: string) => {
        const { promise, resolve } = Promise.withResolvers<string>();
        socket.channel(topic, { config: { private: true } }).on("broadcast", { event: "changed" }, () => {}).subscribe(resolve, 6_000);
        return promise;
      };
      expect(await join(topics[0])).toBe("SUBSCRIBED");
      expect(await join("tugon:supervisors")).toBe("CHANNEL_ERROR");
    } finally { await socket.removeAllChannels(); }
  } finally {
    await Promise.allSettled([intake.close(), handler.close()]);
  }
});

test("standalone PWA uses the generic offline fallback without caching signed-in pages", async ({ page, context, request }) => {
  test.skip(process.env.TUGON_TEST_PRODUCTION !== "1", "Requires the production standalone app");
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page, request, "/resident/requests");
  await expect(page).toHaveURL(/\/resident\/requests$/u);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const online = await page.request.get("/resident/requests");
  expect(online.headers()["cache-control"]).toContain("no-store");
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Offline ka ngayon" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tumawag sa 911" })).toHaveAttribute("href", "tel:911");
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) =>
      (await (await caches.open(name)).keys()).map((entry) => new URL(entry.url).pathname)))).flat());
    expect(cached).toContain("/offline.html");
    expect(cached.filter((path) => path.startsWith("/resident/") || path.startsWith("/api/"))).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
  await page.getByRole("button", { name: /Try again/u }).click();
  await expect(page.getByRole("heading", { name: "Offline ka ngayon" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/resident\/requests$/u);
});
