import { test, expect, type Page } from "@playwright/test";

const date = (days: number) => {
  const d = new Date(Date.now() + days * 86400000 + 6 * 3600000);
  return d.toISOString().slice(0, 10);
};

async function demo(page: Page) {
  await page.goto("/auth/sign-in");

  await page.getByRole("button", {
    name: "Continue in Demo Mode",
    exact: true
  }).click();

  await expect(page.getByRole("heading", {
    name: "A brighter day, Alex."
  })).toBeVisible();
}

async function schedule(page: Page, days = 3) {
  await page.goto("/stations/green-point");

  await page.getByLabel("Charging date", {
    exact: true
  }).fill(date(days));

  await page.getByRole("button", {
    name: "10:00",
    exact: true
  }).click();

  await page.getByRole("button", {
    name: "Continue to payment"
  }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("checkbox").check();
}

test("booking, failed payment retry, persistence, charging and refund journey", async (
  {
    page
  }
) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await demo(page);
  await schedule(page);

  await page.getByRole("button", {
    name: "Test failure",
    exact: true
  }).click();

  await page.getByRole("button", {
    name: /Simulate payment/
  }).click();

  await expect(page.getByRole("alert")).toContainText("Test payment declined");

  await page.getByRole("button", {
    name: "bKash",
    exact: true
  }).click();

  await page.getByLabel("Promo code").fill("HELIO10");

  await page.getByRole("button", {
    name: "Apply",
    exact: true
  }).click();

  await expect(page.getByText("HELIO10 applied", {
    exact: false
  })).toBeVisible();

  await page.getByRole("button", {
    name: /Simulate payment/
  }).click();

  await expect(page).toHaveURL(/\/bookings\/HB-/);

  await expect(page.getByRole("heading", {
    name: "Your bay is waiting."
  })).toBeVisible();

  const url = page.url();
  await page.reload();

  await expect(page.getByRole("heading", {
    name: "Your charging pass"
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Try live charging demo"
  }).click();

  await expect(page).toHaveURL(/\/charging\/CS-/);

  await page.getByRole("button", {
    name: "Simulate car arrival"
  }).click();

  await page.getByRole("button", {
    name: "Start Charging",
    exact: true
  }).click();

  await expect(page.getByRole("button", {
    name: "Pause charging"
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Pause charging"
  }).click();

  await page.getByRole("button", {
    name: "Resume charging"
  }).click();

  await page.getByRole("button", {
    name: "Simulate offline"
  }).click();

  await expect(page.getByText("Connection lost.", {
    exact: false
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Reconnect demo charger"
  }).click();

  await page.getByRole("button", {
    name: "Simulate fault"
  }).click();

  await expect(page.getByText("A simulated charger fault", {
    exact: false
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Emergency stop",
    exact: true
  }).click();

  await expect(page.getByRole("button", {
    name: "Confirm emergency stop"
  })).toBeDisabled();

  await page.getByPlaceholder("STOP", {
    exact: true
  }).fill("STOP");

  await page.getByRole("button", {
    name: "Confirm emergency stop"
  }).click();

  await expect(page.getByRole("heading", {
    name: "A little cleaner. A little further."
  })).toBeVisible();

  await page.goto("/payments");

  await expect(page.getByText("Unused advance returned", {
    exact: false
  })).toBeVisible();

  await page.getByRole("link", {
    name: /View receipt SETTLE/
  }).click();

  await expect(page.getByText("SIMULATED RECEIPT", {
    exact: true
  })).toBeVisible();

  await schedule(page, 4);

  await page.getByRole("button", {
    name: /Simulate payment/
  }).click();

  await expect(page).toHaveURL(/\/bookings\/HB-/);

  await page.getByRole("button", {
    name: "Cancel booking",
    exact: true
  }).click();

  await page.getByRole("button", {
    name: "Confirm cancellation"
  }).click();

  await expect(page.getByRole("heading", {
    name: "Plans changed. All sorted."
  })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", {
    name: "Booking cancelled",
    exact: true
  })).toBeVisible();

  await page.goto(url);

  await expect(page.getByRole("heading", {
    name: "A journey, well charged."
  })).toBeVisible();

  expect(errors).toEqual([]);
});

test("vehicle CRUD, default vehicle and profile persistence", async (
  {
    page
  }
) => {
  await demo(page);
  await page.goto("/vehicles");

  await page.getByRole("button", {
    name: "Add vehicle",
    exact: true
  }).click();

  await page.getByLabel("Vehicle name", {
    exact: true
  }).fill("Weekend EV");

  await page.getByLabel("Registration number", {
    exact: true
  }).fill("DEMO-2026");

  await page.getByRole("button", {
    name: "Save vehicle"
  }).click();

  await expect(page.getByRole("heading", {
    name: "Weekend EV"
  })).toBeVisible();

  const card = page.locator("article").filter({
    hasText: "Weekend EV"
  });

  await card.getByRole("button", {
    name: "Make default"
  }).click();

  await expect(card.getByText("Default vehicle")).toBeVisible();

  await card.getByRole("button", {
    name: "Edit",
    exact: true
  }).click();

  await page.getByLabel("Vehicle name", {
    exact: true
  }).fill("Weekend Electric");

  await page.getByRole("button", {
    name: "Save vehicle"
  }).click();

  await page.reload();

  await expect(page.getByRole("heading", {
    name: "Weekend Electric"
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Remove Weekend Electric"
  }).click();

  await page.getByRole("button", {
    name: "Remove vehicle",
    exact: true
  }).click();

  await expect(page.getByRole("heading", {
    name: "Weekend Electric"
  })).toHaveCount(0);

  await page.goto("/profile");

  await page.getByLabel("Full name", {
    exact: true
  }).fill("Alex Green");

  await page.getByRole("button", {
    name: "Save changes"
  }).click();

  await page.getByRole("switch", {
    name: "News & offers",
    exact: false
  }).click();

  await page.reload();

  await expect(page.getByLabel("Full name", {
    exact: true
  })).toHaveValue("Alex Green");

  await expect(page.getByRole("switch", {
    name: "News & offers",
    exact: false
  })).toBeChecked();
});

test("station filters, saved station, map and empty state", async (
  {
    page
  }
) => {
  await demo(page);
  await page.goto("/stations");
  await page.getByLabel("Search stations").fill("no such station");

  await expect(page.getByRole("heading", {
    name: "No stations in this view."
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Clear filters"
  }).click();

  await page.getByLabel("Connector filter").selectOption("Type 2");
  await expect(page.locator("article.station-card")).toHaveCount(1);

  await page.getByRole("button", {
    name: "Reset",
    exact: true
  }).click();

  await page.getByRole("button", {
    name: "Saved",
    exact: true
  }).click();

  await expect(page.locator("article.station-card")).toHaveCount(1);

  await page.getByRole("button", {
    name: "Saved",
    exact: true
  }).click();

  await page.getByLabel("Search stations").fill("Green Point");

  await page.getByRole("button", {
    name: "Map",
    exact: true
  }).click();

  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".map-marker")).toHaveCount(1);
});

test("route protection and explicit admin demo", async (
  {
    page
  }
) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.goto("/auth/sign-in?role=admin");

  await page.getByRole("button", {
    name: "Continue as Demo Admin"
  }).click();

  await expect(page.getByRole("heading", {
    name: "Your network preview."
  })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/partner/);
});

test("map tile failure and denied location keep station discovery usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (_success: unknown, fail: (error: { code: number; message: string }) => void) => fail({ code: 1, message: "Permission denied for test" })
    } });
  });
  await page.route("https://*.tile.openstreetmap.org/**", route => route.abort());
  await page.goto("/stations");
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.getByText("Location unavailable or permission denied.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByText("Map tiles are unavailable.", { exact: false })).toBeVisible();
  await expect(page.locator("article.station-card")).toHaveCount(5);
  await page.getByRole("link", { name: "HelioBay Green Point", exact: true }).click();
  await expect(page.getByRole("heading", { name: "HelioBay Green Point", exact: true })).toBeVisible();
});

test("all primary pages render and fit 390, 768, 1024 and 1440 pixels", async (
  {
    page
  }
) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await demo(page);

  for (const route of [
    "/how-it-works",
    "/pricing",
    "/sustainability",
    "/auth/sign-up",
    "/auth/forgot-password",
    "/bookings",
    "/vehicles",
    "/history",
    "/payments",
    "/profile",
    "/privacy",
    "/terms"
  ]) {
    await page.goto(route);

    await expect(page.getByRole("heading", {
      level: 1
    })).toBeVisible();

    await expect(page.getByText("This page couldn’t load.")).toHaveCount(0);
  }

  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({
      width,
      height: 1000
    });

    for (const route of ["/", "/dashboard", "/stations", "/stations/green-point"]) {
      await page.goto(route);

      if (route === "/dashboard") await expect(page.locator(".recharts-surface")).toBeVisible();

      await expect(page.getByRole("heading", {
        level: 1
      })).toBeVisible();

      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      if (width === 390 || width === 1440) await page.screenshot({
        path: `artifacts/${route.replaceAll("/", "-") || "home"}-${width}.png`,
        fullPage: true
      });
    }
  }

  expect(errors).toEqual([]);
});
