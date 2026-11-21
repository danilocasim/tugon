import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TUGON_TEST_ORIGIN ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL, actionTimeout: 10_000, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: process.env.TUGON_TEST_ORIGIN ? undefined : {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
