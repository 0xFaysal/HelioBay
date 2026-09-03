import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 60000,
  testMatch: ["credit.spec.ts", "api-mode.spec.ts", "energy-map-receipts.spec.ts", "google-auth.spec.ts"],
  expect: { timeout: 12000 }, reporter: "list",
  use: { baseURL: process.env.TEST_BASE_URL || "http://localhost:3000", channel: "msedge", headless: true, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
