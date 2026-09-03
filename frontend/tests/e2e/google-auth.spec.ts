import { test, expect } from "@playwright/test";
test.skip(process.env.TEST_GOOGLE_POPUP !== "true", "Opt-in SDK/UI test: requires public Firebase configuration.");

test("Google popup blocking offers recovery and leaves email sign-in usable", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    // Isolate Google's remote iframe transport, not the Firebase SDK or our auth
    // service. Firebase still calls window.open and raises auth/popup-blocked.
    const iframe = { restyle: async () => {}, ping: async (ready: () => void) => { ready(); }, register: () => {} };
    Object.defineProperty(window, "gapi", { configurable: true, value: { iframes: {
      Iframe: function () {}, CROSS_ORIGIN_IFRAMES_FILTER: () => true,
      getContext: () => ({ open: (_options: unknown, ready: (value: typeof iframe) => unknown) => ready(iframe) }),
    } } });
    window.open = () => { document.documentElement.dataset.testPopupAttempts = String(Number(document.documentElement.dataset.testPopupAttempts ?? 0) + 1); return null; };
  });
  await page.goto("/auth/sign-in?next=%2Fwallet");
  const google = page.getByRole("button", { name: "Continue with Google", exact: true });
  await expect(page.getByRole("heading", { name: "Good to have you back." })).toBeVisible();
  test.skip(await page.getByText("Firebase isn’t configured.", { exact: false }).isVisible(), "Popup integration check requires public Firebase configuration.");
  await expect(google).toBeEnabled(); await google.click();
  // Run this check on localhost with the normal Firebase authDomain (no redirect
  // domain configured). Recovery is an actionable message, not an OAuth retry loop.
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your browser blocked the Google sign-in window", { timeout: 30000 });
  await expect(page.locator("html")).toHaveAttribute("data-test-popup-attempts", "1");
  await expect(google).toBeEnabled();
  await page.getByLabel("Email address").fill("not-an-email"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/google-popup-recovery-390.png", fullPage: true });
  expect(errors).toEqual([]);
});
