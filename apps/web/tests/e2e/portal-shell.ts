import { expect, type Page } from "@playwright/test";

export async function expectPortalShell(page: Page, portal: {
  root: "/resident" | "/barangay" | "/tanod";
  landing: string;
  navigation: string;
  current: RegExp;
  secondary: RegExp;
  forbidden?: RegExp;
}) {
  const manifest = page.locator('link[rel="manifest"]');
  const manifestUrl = `${portal.root}.webmanifest`;
  await expect(manifest).toHaveAttribute("href", manifestUrl);
  const response = await page.request.get(manifestUrl);
  expect(response.ok()).toBe(true);
  const { id, start_url, scope, display } = await response.json();
  expect({ id, start_url, scope, display }).toEqual({ id: portal.root, start_url: portal.root, scope: portal.root, display: "standalone" });
  await page.goto(start_url);
  await expect.poll(() => new URL(page.url()).pathname).toBe(portal.landing);

  const original = page.viewportSize();
  const nav = page.getByRole("navigation", { name: portal.navigation, exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(nav.getByRole("link", { name: portal.current })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: portal.secondary })).toBeVisible();
    if (portal.forbidden) await expect(nav.getByRole("link", { name: portal.forbidden })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  if (original) await page.setViewportSize(original);
}
