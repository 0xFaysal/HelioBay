import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.TEST_FULL_STACK !== "true", "Requires isolated PostgreSQL/MQTT full-stack server.");

type TestContext = {
  ownerToken: string;
  adminToken: string;
  stationId: string;
  bayId: string;
  vehicleId: string;
  paymentId?: string;
};

async function signIn(page: Page, token: string, email: string) {
  await page.route("https://identitytoolkit.googleapis.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("accounts:signInWithPassword")) {
      return route.fulfill({
        json: { localId: "test-user", email, idToken: token, refreshToken: "test-refresh", expiresIn: "3600", registered: true },
      });
    }
    if (path.endsWith("accounts:lookup")) {
      return route.fulfill({ json: { users: [{ localId: "test-user", email, emailVerified: true }] } });
    }
    return route.fulfill({ status: 400, json: { error: { message: "UNEXPECTED_TEST_REQUEST" } } });
  });
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Test-only-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("owner wallet, controller ACK, metering, settlement, notification and admin energy join end to end", async ({ page, request, browser }) => {
  const ctx = await request.get("http://127.0.0.1:4008/__test/context").then((response) => response.json()) as TestContext;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://sandbox.sslcommerz.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>SSLCOMMERZ test adapter</h1>" }));

  await signIn(page, ctx.ownerToken, "owner@heliobay.test");
  await expect(page).toHaveURL(/dashboard/);
  await page.goto(`/charge?station=${ctx.stationId}&bay=${ctx.bayId}`);
  await expect(page.getByText("Plug detected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start Charging" }).click();
  await expect(page).toHaveURL(/charging\//);
  await expect(page.locator(".credit-source").filter({ hasText: /START PENDING|CHARGING/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A cleaner journey, complete." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Settled from prepaid credits/)).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Charging complete")).toBeVisible();

  await page.goto("/wallet/top-up");
  await page.getByLabel("Custom amount (Credits)").fill("10.00");
  await page.getByRole("button", { name: "Review top-up" }).click();
  const checkoutPromise = page.waitForURL("https://sandbox.sslcommerz.com/**");
  await page.getByRole("button", { name: /Continue to SSLCOMMERZ/ }).click();
  await checkoutPromise;
  const paymentId = (await request.get("http://127.0.0.1:4008/__test/context").then((response) => response.json()) as TestContext).paymentId;
  expect(paymentId).toBeTruthy();
  await request.post(`http://127.0.0.1:4008/__test/payments/${paymentId}/settle`);
  await page.goto(`/payment/success?paymentId=${paymentId}`);
  await expect(page.getByRole("heading", { name: "Credits, ready to go." })).toBeVisible();

  const admin = await browser.newPage();
  await signIn(admin, ctx.adminToken, "admin@heliobay.test");
  await expect(admin).toHaveURL(/admin/);
  await admin.goto(`/admin/stations/${ctx.stationId}`);
  await expect(admin.getByRole("heading", { name: "A balanced flow of power." })).toBeVisible();
  await expect(admin.getByText("Digital Twin", { exact: true })).toBeVisible();
  await admin.close();

  expect(errors).toEqual([]);
});
