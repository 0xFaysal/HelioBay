import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/credit/model";
test.skip(process.env.TEST_APP_MODE === "api", "Digital Twin journeys use the demo server.");
const state = (page: Page): Promise<Snapshot> => page.evaluate(() => JSON.parse(localStorage.getItem("heliobay-credit-v3")!).state.data);
async function login(page: Page, admin = false) {
  await page.goto(`/auth/sign-in${admin ? "?role=admin" : ""}`);
  await page.getByRole("button", { name: admin ? "Continue as Demo Admin" : "Continue in Demo Mode", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(admin ? "A clearer view" : "A brighter day");
}
async function confirm(page: Page) { await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click(); await expect(page.getByRole("alertdialog")).toHaveCount(0); }
async function assertBrand(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/ESP32|microcontroller|MQTT|GPIO|\bRelay\b|DEMO MODE|shared on this browser|Solar → Storage → EV → Grid|Heliobay|HELIOBAY/);
  await expect(page.locator(".connection-strip")).toHaveCount(0);
  expect(await page.locator(".brand").first().innerText()).toBe("HelioBay");
}

test("admin energy monitoring, tariff policy, dispatch and history work at all widths", async ({ page, context }) => {
  test.setTimeout(150000); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page, true); await expect(page.locator(".energy-station")).toHaveCount(5); await assertBrand(page);
  await page.goto("/admin/stations/green-point"); await expect(page.getByRole("figure", { name: "Station energy flow" })).toBeVisible();
  await page.getByRole("button", { name: "Energy policy", exact: true }).click();
  await page.getByLabel("Export tariff (BDT / kWh)").fill("7.55"); await page.getByLabel("Import tariff (BDT / kWh)").fill("11.25");
  await page.getByLabel("Minimum reserve (%)").fill("99"); await page.getByRole("button", { name: "Save energy policy" }).click(); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("reserve");
  await page.getByLabel("Minimum reserve (%)").fill("20"); await page.getByRole("button", { name: "Save energy policy" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  const controller = await context.newPage(); await login(controller, true); await controller.goto("/admin/devices");
  await controller.getByLabel("Station battery (%)").fill("95"); await controller.getByLabel("Solar power (kW)").fill("40"); await controller.getByRole("button", { name: "Apply energy inputs" }).click();
  await expect.poll(async () => (await state(page)).energy[0].current.grid.exportPowerKw).toBeGreaterThan(0);
  await expect(page.locator(".station-energy-flow figcaption")).toContainText("exporting");
  await expect.poll(async () => (await state(page)).energy[0].current.finance.exportEarningsMinor).toBeGreaterThan(0);
  await controller.close();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true).catch(async e => { throw new Error(String(e) + JSON.stringify(await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll("body *")].filter(el => el instanceof HTMLElement && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right}))})))); });
    await page.screenshot({ path: `artifacts/energy-station-${width}.png`, fullPage: true });
  }
  for (const label of ["Last 24 hours", "Last 7 days", "Last 30 days"]) { await page.getByRole("button", { name: label, exact: true }).click(); await expect(page.getByRole("group", { name: "Configured import cost and export earnings" })).toBeVisible(); }
  await page.getByText("Interval records & CSV export", { exact: true }).click();
  const download = page.waitForEvent("download"); await page.locator(".energy-records").getByRole("button", { name: "Export visible CSV" }).click(); expect((await download).suggestedFilename()).toContain("HelioBay-station energy history");
  await page.getByRole("button", { name: "Custom range" }).click(); await page.getByLabel("Energy history from").fill("2020-01-01"); await page.getByLabel("Energy history to").fill("2020-01-02"); await expect(page.getByText("No energy intervals recorded", { exact: false })).toBeVisible();
  await page.getByLabel("Energy history from").fill("2021-01-01"); await expect(page.getByText("Choose a valid start and end date.")).toBeVisible();
  await page.getByRole("button", { name: "Live", exact: true }).click(); await page.emulateMedia({ reducedMotion: "reduce" }); expect(await page.locator(".flow-edge.active path").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await assertBrand(page); expect(errors).toEqual([]);
});

test("manual map viewport survives telemetry, filters and map/list toggles", async ({ page }) => {
  await page.route("https://*.tile.openstreetmap.org/**", route => route.abort());
  await page.goto("/stations"); const map = page.locator(".leaflet-container"); await expect(map).toBeVisible();
  const original = await map.getAttribute("data-viewport"); const bounds = (await map.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .55); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .7, { steps: 12 }); await page.mouse.up();
  await expect(map).not.toHaveAttribute("data-viewport", original!); await expect(map).toHaveAttribute("data-manual-viewport", "true");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  // Let the user-requested zoom transition settle before checking the telemetry update.
  await expect(map).toHaveAttribute("data-viewport", /,13$/);
  const moved = await map.getAttribute("data-viewport"); const revision = (await state(page)).revision;
  await expect.poll(async () => (await state(page)).revision).toBeGreaterThan(revision + 2);
  await expect(map).toHaveAttribute("data-viewport", moved!);
  await page.getByLabel("Station filter").selectOption("available"); await expect(map).toHaveAttribute("data-viewport", moved!);
  await page.getByLabel("Search stations").fill("no match"); await expect(page.getByRole("heading", { name: "No stations match your search." })).toBeVisible(); await expect(map).toHaveAttribute("data-viewport", moved!);
  await page.getByRole("button", { name: "Clear filters" }).click(); await page.getByRole("button", { name: "List view", exact: true }).click(); await page.getByRole("button", { name: "Map view", exact: true }).click(); await expect(map).toHaveAttribute("data-viewport", moved!);
  await page.getByRole("button", { name: "Fit stations" }).click(); await expect(map).not.toHaveAttribute("data-viewport", moved!);
  await expect(page.locator(".station-pin")).toHaveCount(5); await expect(page.locator(".credit-location")).toHaveCount(0); await assertBrand(page);
});

test("map location accuracy, nearest distances, keyboard selection and mobile preview", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 23.793, longitude: 90.401, accuracy: 45 });
  await page.route("https://*.tile.openstreetmap.org/**", route => route.abort());
  await page.goto("/stations"); await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.locator(".user-position-marker")).toBeVisible(); await expect(page.locator(".discovery-results-label")).toContainText("±45 m");
  await expect(page.locator(".station-card").first()).toContainText("Banani"); await expect(page.locator(".station-card").first()).toContainText("0.0 km");
  const marker = page.locator('.station-pin-wrapper[title^="HelioBay Banani"]'); await marker.focus(); await page.keyboard.press("Enter"); await expect(page.locator(".desktop-map-preview")).toContainText("Banani");
  await marker.focus(); await page.keyboard.press("Space"); await expect(page.locator(".desktop-map-preview")).toContainText("Banani");
  for (const width of [390, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await expect(marker).toBeInViewport(); await page.screenshot({ path: `artifacts/station-map-${width}.png`, fullPage: true }); }
  await page.setViewportSize({ width: 390, height: 844 }); await marker.click(); await expect(page.getByRole("dialog")).toContainText("Banani"); await expect(page.getByRole("dialog").getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", /destination=23.793,90.401/);
  await page.reload(); await expect(page.locator(".user-position-marker")).toHaveCount(0);
});

test("charging and top-up receipts retain branding and print without dashboard chrome", async ({ page, context }) => {
  test.setTimeout(120000); await login(page); await page.goto("/wallet/top-up"); await page.getByLabel("Custom amount (Credits)").fill("10.01"); await page.getByRole("button", { name: "Review top-up" }).click(); await page.getByRole("button", { name: "Continue to SSLCOMMERZ Sandbox", exact: true }).click(); await page.getByRole("button", { name: "Simulate successful payment" }).click();
  const receipt = page.locator(".printable-receipt"); await expect(receipt).toContainText("Credit top-up receipt"); await expect(receipt).toContainText("SSLCOMMERZ transaction reference"); await expect(receipt).toContainText("510.01 Credits"); await expect(receipt).toContainText("Sandbox");
  await page.emulateMedia({ media: "print" }); await expect(page.locator(".owner-sidebar")).toBeHidden(); await expect(receipt.locator(".brand")).toBeVisible(); await expect(receipt.locator(".receipt-footer")).toBeVisible(); await page.screenshot({ path: "artifacts/topup-print.png", fullPage: true }); await page.emulateMedia({ media: "screen" });
  await page.goto("/charge"); await page.getByRole("button", { name: "Simulate plug connect" }).click(); await page.getByRole("button", { name: "Start Charging", exact: true }).click(); await expect.poll(async () => (await state(page)).sessions[0]?.state).toBe("charging"); await assertBrand(page);
  await expect(page.getByText(/grid fallback|Station Controller|Battery voltage|Charging current|Energy source/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Stop Charging", exact: true }).click(); await confirm(page); await expect(receipt).toContainText("Charging receipt");
  for (const text of ["HelioBay", "Alex Morgan", "Gulshan Avenue", "Bay 01", "CCS2", "Opening balance", "Closing balance", "Equivalent BDT", "Stopped by owner", "Generated"]) await expect(receipt).toContainText(text);
  await page.getByLabel("Print layout").selectOption("compact"); await page.emulateMedia({ media: "print" }); await expect(receipt.locator(".brand")).toBeVisible(); await expect(page.locator("h1")).toBeHidden(); await page.screenshot({ path: "artifacts/charging-print-compact.png", fullPage: true }); await page.emulateMedia({ media: "screen" });
  const admin = await context.newPage(); await login(admin, true); await admin.goto("/admin/sessions"); const id = (await state(page)).sessions[0].id; await admin.getByRole("button", { name: `Inspect ${id}`, exact: true }).click(); await expect(admin.locator(".printable-receipt")).toContainText("Charging receipt"); await admin.emulateMedia({ media: "print" }); await expect(admin.locator(".printable-receipt .brand")).toBeVisible(); await expect(admin.locator(".owner-sidebar")).toBeHidden(); await admin.screenshot({ path: "artifacts/admin-receipt-print.png", fullPage: true });
});
