import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
  test(`public entry exposes three portals at ${width}px without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const portals = page.getByRole("navigation", { name: "Munti Report portals" });
    await expect(portals.getByRole("link")).toHaveCount(3);
    await expect(portals.getByRole("link", { name: /Resident portal/ })).toHaveAttribute("href", "/resident");
    await expect(portals.getByRole("link", { name: /Barangay portal/ })).toHaveAttribute("href", "/barangay");
    await expect(portals.getByRole("link", { name: /Tanod app/ })).toHaveAttribute("href", "/tanod");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
