import { test, expect, type BrowserContext } from "@playwright/test";

test.skip(process.env.TEST_GOOGLE_REDIRECT !== "true", "Opt-in Firebase SDK test; requires public Firebase config and a running local frontend.");
const origin = "https://heliobay.test";
test.afterEach(async ({ page }) => {
  // Let Next's final asset/prefetch work finish before disposing the test client.
  await page.waitForLoadState("networkidle");
});

// A test-only HTTPS origin serves the actual app from the local server. Only
// Google's helper transport and Firebase REST responses are fixtures. No real
// Google account, token, network authorization, or production setting is used.
async function googleFixture(context: BrowserContext, baseURL: string, denyDomain = false) {
  const attempts = { popup: 0, redirect: 0, exchanges: 0 };
  await context.exposeBinding("reportPopup", () => { attempts.popup++; });
  await context.addInitScript(() => {
    window.open = () => {
      void (window as unknown as { reportPopup: () => Promise<void> }).reportPopup();
      return null;
    };
    const iframe = {
      restyle: async () => {},
      ping: (ready: () => void) => { ready(); return Promise.resolve(); },
      register: (name: string, callback: (event: unknown) => void) => {
        if (name !== "authEvent") return;
        const result = sessionStorage.getItem("fixture-google-result");
        // Returning from the test helper triggers Firebase's real redirect result
        // processing, credential exchange, persistence and auth-state observer.
        sessionStorage.removeItem("fixture-google-result");
        setTimeout(() => callback({ authEvent: result === "success" ? {
          type: "signInViaRedirect", eventId: null,
          urlResponse: location.origin + "/__/auth/handler",
          sessionId: "test-only-session", tenantId: null,
        } : { type: "unknown", error: { code: "auth/no-auth-event" } } }), 0);
      },
    };
    Object.defineProperty(window, "gapi", { configurable: true, value: { iframes: {
      Iframe: function () {}, CROSS_ORIGIN_IFRAMES_FILTER: () => true,
      getContext: () => ({ open: (_options: unknown, ready: (value: typeof iframe) => unknown) => ready(iframe) }),
    } } });
  });
  const user = {
    localId: "google-test-owner", displayName: "Google Test Owner", email: "owner@example.test", emailVerified: true,
    providerUserInfo: [{ providerId: "google.com", rawId: "google-test-owner", displayName: "Google Test Owner", email: "owner@example.test" }],
  };
  const now = Math.floor(Date.now() / 1000);
  const token = [Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"), Buffer.from(JSON.stringify({
    sub: user.localId, user_id: user.localId, email: user.email, name: user.displayName,
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "google.com" },
  })).toString("base64url"), "test-only-signature"].join(".");
  await context.route("https://identitytoolkit.googleapis.com/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/projects")) return route.fulfill({ json: { authorizedDomains: denyDomain ? [] : ["heliobay.test"] } });
    if (path.endsWith("accounts:signInWithIdp")) {
      attempts.exchanges++;
      return route.fulfill({ json: { ...user, idToken: token, refreshToken: "test-only-refresh-token", expiresIn: "3600", providerId: "google.com" } });
    }
    if (path.endsWith("accounts:lookup")) return route.fulfill({ json: { users: [user] } });
    return route.fulfill({ status: 400, json: { error: { message: "Unexpected Firebase request in test" } } });
  });
  await context.route(origin + "/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__/auth/handler") {
      attempts.redirect++;
      expect(url.searchParams.get("authType")).toBe("signInViaRedirect");
      expect(url.searchParams.get("providerId")).toBe("google.com");
      const returnTo = url.searchParams.get("redirectUrl")!;
      expect(new URL(returnTo).origin).toBe(origin);
      return route.fulfill({ contentType: "text/html", body: '<h1>Test Google authorization</h1><button id="complete">Finish test sign-in</button><button id="cancel">Cancel test sign-in</button><script>for (const [id,result] of [["complete","success"],["cancel","cancelled"]]) document.getElementById(id).onclick=()=>{sessionStorage.setItem("fixture-google-result",result);location.replace(' + JSON.stringify(returnTo) + ')};</script>' });
    }
    try {
      const response = await route.fetch({ url: baseURL + url.pathname + url.search });
      const body = await response.body();
      // Navigating to Google cancels unfinished image/prefetch requests. Those
      // are not OAuth failures, and an already-aborted route cannot be fulfilled.
      if (route.request().failure()) return;
      await route.fulfill({ status: response.status(), headers: response.headers(), body });
    } catch (error) {
      if (route.request().failure()) return;
      throw error;
    }
  });
  return attempts;
}

test("Google completes in the same tab with popups blocked, restores destination and survives refresh", async ({ page, context, baseURL }) => {
  const attempts = await googleFixture(context, baseURL!);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/auth/sign-in?next=%2Fwallet");
  test.skip(await page.getByText("Firebase isn’t configured.", { exact: false }).isVisible(), "Public Firebase configuration required.");
  const google = page.getByRole("button", { name: "Continue with Google", exact: true });
  await expect(google).toBeEnabled(); await google.click();
  await expect(page.getByRole("heading", { name: "Test Google authorization" })).toBeVisible();
  expect(attempts.popup).toBe(0); expect(attempts.redirect).toBe(1); expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: "Finish test sign-in" }).click();
  await expect(page).toHaveURL(origin + "/wallet");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(attempts.exchanges).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); await expect(page).toHaveURL(origin + "/wallet");
  expect(await page.evaluate(() => sessionStorage.getItem("heliobay-google-redirect"))).toBeNull();
  expect(errors).toEqual([]);
});

test("cancelled redirect returns to a working form, can retry and has no mobile overflow", async ({ page, context, baseURL }) => {
  const attempts = await googleFixture(context, baseURL!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/auth/sign-in");
  const google = page.getByRole("button", { name: "Continue with Google", exact: true });
  await expect(google).toBeEnabled(); await google.click();
  await page.getByRole("button", { name: "Cancel test sign-in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("did not complete");
  await expect(google).toBeEnabled();
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/google-redirect-retry-390.png", fullPage: true });
  await google.click(); await page.getByRole("button", { name: "Finish test sign-in" }).click();
  await expect(page).toHaveURL(origin + "/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(attempts.popup).toBe(0); expect(attempts.redirect).toBe(2);
});

test("a missing Firebase authorized domain is not hidden or retried in a loop", async ({ page, context, baseURL }) => {
  const attempts = await googleFixture(context, baseURL!, true);
  await page.goto(origin + "/auth/sign-in");
  const google = page.getByRole("button", { name: "Continue with Google", exact: true });
  await expect(google).toBeEnabled(); await google.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("exact domain");
  await expect(google).toBeEnabled();
  expect(attempts).toEqual({ popup: 0, redirect: 0, exchanges: 0 });
  expect(await page.evaluate(() => sessionStorage.getItem("heliobay-google-redirect"))).toBeNull();
});

test("browser Back from Google allows another sign-in attempt", async ({ page, context, baseURL }) => {
  const attempts = await googleFixture(context, baseURL!);
  await page.goto(origin + "/auth/sign-in");
  const google = page.getByRole("button", { name: "Continue with Google", exact: true });
  await expect(google).toBeEnabled(); await google.click();
  await expect(page.getByRole("heading", { name: "Test Google authorization" })).toBeVisible();
  await page.goBack(); await expect(google).toBeEnabled();
  await google.click(); await page.getByRole("button", { name: "Finish test sign-in" }).click();
  await expect(page).toHaveURL(origin + "/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(attempts.popup).toBe(0); expect(attempts.redirect).toBe(2);
});
