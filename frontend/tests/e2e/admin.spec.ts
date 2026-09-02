import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, role: "owner" | "admin") {
  await page.goto(`/auth/sign-in${role === "admin" ? "?role=admin" : ""}`);
  await page.getByRole("button", { name: role === "admin" ? "Continue as Demo Admin" : "Continue in Demo Mode", exact: true }).click();
  await expect(page).toHaveURL(role === "admin" ? /\/admin$/ : /\/dashboard$/);
}
async function confirm(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
}

test("admin device commands acknowledge, fail and time out; role is tab-local", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page, "owner");
  const admin = await context.newPage(); await login(admin, "admin");
  await admin.goto("/admin/devices");
  await confirm(admin, "Test Mode");
  await expect(admin.locator(".command-panel")).toContainText("pending");
  await expect(admin.locator(".command-panel")).toContainText("acknowledged");
  await admin.getByLabel("Next command outcome").selectOption("failure");
  await expect(admin.getByLabel("Next command outcome")).toHaveValue("failure");
  await confirm(admin, "Exit Test Mode"); await expect(admin.locator(".command-panel")).toContainText("failed");
  await admin.getByLabel("Next command outcome").selectOption("timeout");
  await expect(admin.getByLabel("Next command outcome")).toHaveValue("timeout");
  await confirm(admin, "Exit Test Mode"); await expect(admin.locator(".command-panel")).toContainText("timed-out");
  await page.reload(); await expect(page.getByRole("heading", { name: "A brighter day, Alex." })).toBeVisible();
  await admin.reload(); await expect(admin.getByRole("heading", { name: "Connected. Accounted for." })).toBeVisible();
  expect(errors).toEqual([]); await admin.close();
});

test("shared owner/admin charging, interruption, fault resolution and vehicle-removed safety stop", async ({ page, context }) => {
  await login(page, "owner"); await page.goto("/bookings/HB-DEMO01");
  await page.getByRole("button", { name: "Try live charging demo" }).click();
  await page.getByRole("button", { name: "Simulate car arrival" }).click();
  await page.getByRole("button", { name: "Start Charging", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause charging" })).toBeVisible();
  const admin = await context.newPage(); await login(admin, "admin"); await admin.goto("/admin/devices");
  await expect(admin.getByText("ON", { exact: true })).toBeVisible();
  await confirm(admin, "Simulate offline"); await expect(page.getByText("Device offline. Session interrupted.", { exact: false })).toBeVisible();
  await confirm(admin, "Reconnect device"); await page.getByRole("button", { name: "Start Charging", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause charging" })).toBeVisible();
  await admin.getByRole("button", { name: "Inject sensor fault" }).click();
  await expect(page.getByText("A blocking fault needs administrator inspection.")).toBeVisible();
  await admin.goto("/admin/maintenance"); await admin.getByLabel("Search faults").fill("SENSOR");
  await admin.locator(".admin-desktop-table").getByRole("button", { name: /^Inspect / }).click();
  await admin.getByLabel("Resolution / acknowledgement note").fill("Sensor wiring checked; simulated readings restored.");
  await confirm(admin, "Resolve fault");
  await admin.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Start Charging", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause charging" })).toBeVisible();
  await admin.goto("/admin/devices"); await confirm(admin, "Remove vehicle");
  await expect(page.getByRole("heading", { name: "A little cleaner. A little further." })).toBeVisible();
  await expect(page.getByText("Vehicle removed — automatic safety stop")).toBeVisible();
  await page.goto("/payments"); await expect(page.getByText("Unused advance returned", { exact: false })).toBeVisible();
  await admin.goto("/admin/sessions"); await admin.getByLabel("Search sessions").fill("completed");
  await expect(admin.locator(".admin-desktop-table")).toContainText("completed");
  await admin.close();
});

test("bay availability, pricing, refunds and persistence update across tabs", async ({ page, context }) => {
  await login(page, "owner"); await page.goto("/stations"); await page.getByLabel("Search stations", { exact: true }).fill("Green Point");
  const admin = await context.newPage(); await login(admin, "admin"); await admin.goto("/admin/bays");
  await admin.getByLabel("Search bays").fill("Green Point");
  await admin.getByRole("button", { name: "Inspect green-point/BAY01", exact: true }).click();
  await confirm(admin, "Disable bay"); await expect(page.getByText("2 bays available", { exact: true })).toBeVisible();
  await admin.getByRole("button", { name: "Close", exact: true }).click();
  await admin.goto("/admin/settings"); await admin.getByLabel("Price per kWh (৳)", { exact: false }).fill("23");
  await admin.getByRole("button", { name: "Save pricing", exact: true }).click();
  await expect(admin.getByText("All changes saved")).toBeVisible(); await expect(page.locator(".station-card")).toContainText("৳23");
  await admin.getByLabel("Demo Speed", { exact: true }).selectOption("60"); await expect(page.locator(".connection-strip")).toContainText("60×");
  await admin.goto("/admin/refunds"); await admin.getByRole("button", { name: "Inspect RF-REVIEW01", exact: true }).click();
  await confirm(admin, "Approve simulated refund"); await expect(admin.getByRole("button", { name: "Approve simulated refund", exact: true })).toBeHidden();
  await page.goto("/payments"); await expect(page.getByText("Demo metering reconciliation", { exact: false })).toBeVisible();
  await admin.reload(); await admin.goto("/admin/settings"); await expect(admin.getByLabel("Price per kWh (৳)", { exact: false })).toHaveValue("23"); await expect(admin.getByLabel("Demo Speed", { exact: true })).toHaveValue("60");
  await admin.close();
});

test("owner role cannot access admin; admin routes fit mobile and desktop", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", message => { if (["error", "warning"].includes(message.type()) && !message.text().includes("Download the React DevTools") && !message.text().includes("ERR_NETWORK_ACCESS_DENIED")) errors.push(message.text()); });
  await login(page, "owner"); await page.goto("/admin/devices"); await expect(page.getByRole("heading", { name: "Administrator access required." })).toBeVisible();
  await login(page, "admin");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/admin", "/admin/stations", "/admin/stations/green-point", "/admin/bays", "/admin/devices", "/admin/bookings", "/admin/sessions", "/admin/payments", "/admin/refunds", "/admin/analytics", "/admin/maintenance", "/admin/settings"]) {
      await page.goto(route); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "/admin") { await expect(page.locator(".recharts-wrapper > .recharts-surface")).toHaveCount(2); await expect(page.locator(".leaflet-container")).toBeVisible(); }
      if (route === "/admin/analytics") await expect(page.locator(".recharts-wrapper > .recharts-surface")).toHaveCount(4);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (["/admin", "/admin/devices", "/admin/analytics"].includes(route)) await page.screenshot({ path: `artifacts/${route.replaceAll("/", "-")}-${width}.png`, fullPage: true });
    }
    if (width === 390) { await page.getByRole("button", { name: "Open admin navigation" }).click(); await page.getByRole("navigation", { name: "Mobile admin navigation" }).getByRole("link", { name: "Devices", exact: true }).click(); await expect(page).toHaveURL(/\/admin\/devices$/); }
  }
  expect(errors).toEqual([]);
});

test("owner STOP acknowledgement settles once; charge limit auto-completes at accelerated speed", async ({ page, context }) => {
  await login(page, "owner"); await page.goto("/bookings/HB-DEMO01");
  await page.getByRole("button", { name: "Try live charging demo" }).click();
  await page.getByRole("button", { name: "Simulate car arrival" }).click();
  await page.getByRole("button", { name: "Start Charging", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause charging" })).toBeEnabled();
  await page.getByRole("button", { name: "Stop Charging", exact: true }).click();
  await page.getByRole("button", { name: "Confirm stop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A little cleaner. A little further." })).toBeVisible();
  await page.reload(); await expect(page.getByText("Stopped by user", { exact: true })).toBeVisible();
  const admin = await context.newPage(); await login(admin, "admin"); await admin.goto("/admin/settings");
  await admin.getByLabel("Default charge limit (%)", { exact: false }).fill("65"); await admin.getByRole("button", { name: "Save pricing", exact: true }).click();
  await expect(admin.getByText("All changes saved")).toBeVisible(); await admin.getByLabel("Demo Speed", { exact: true }).selectOption("60");
  await page.goto("/stations/green-point");
  const date = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Charging date", { exact: true }).fill(date); await page.getByRole("button", { name: "10:00", exact: true }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click(); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /Simulate payment/ }).click();
  await page.getByRole("button", { name: "Try live charging demo" }).click();
  // A previous vehicle may still be detected at the same bay.
  const arrival = page.getByRole("button", { name: "Simulate car arrival" }); if (await arrival.isVisible()) await arrival.click();
  await page.getByRole("button", { name: "Start Charging", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A little cleaner. A little further." })).toBeVisible();
  await expect(page.getByText("Charge limit reached", { exact: true })).toBeVisible(); await admin.close();
});
