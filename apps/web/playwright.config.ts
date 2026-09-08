import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    // Set PLAYWRIGHT_CHROMIUM_PATH to pin a specific Chromium binary (e.g. in a sandboxed
    // CI environment that pre-installs browsers outside Playwright's default cache).
    // Left unset, Playwright resolves the browser it installed via `npx playwright install`.
    launchOptions: process.env["PLAYWRIGHT_CHROMIUM_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"] }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
