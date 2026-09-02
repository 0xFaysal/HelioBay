import { test, expect } from "@playwright/test";
test.skip(process.env.TEST_APP_MODE !== "api", "Run separately against the isolated API-mode server.");
test("API mode with no backend fails honestly and allows retry without seeded success", async ({ page }) => {
  await page.goto("/stations");
  await expect(page.getByRole("alert").filter({ hasText: "Backend URL is not configured" })).toBeVisible();
  await expect(page.locator(".station-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Backend URL is not configured" })).toBeVisible();
  await page.goto("/auth/sign-in?role=admin");
  await page.getByRole("button", { name: "Continue as Demo Admin" }).click();
  await expect(page.getByRole("heading", { name: "Network data unavailable." })).toBeVisible();
  await expect(page.getByText("No demo records are being shown.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry connection", exact: true })).toBeEnabled();
});
