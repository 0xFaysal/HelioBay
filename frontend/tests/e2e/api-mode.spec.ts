import { test, expect } from "@playwright/test";
test.skip(process.env.TEST_APP_MODE !== "api", "Run against the isolated API-mode server.");
test("API mode rejects demo login and reports missing backend without seeded success", async ({page}) => {
  await page.goto("/stations");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Backend URL is not configured");
  await expect(page.locator(".station-card")).toHaveCount(0);
  await page.getByRole("button",{name:"Retry connection",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Backend URL is not configured");
  for(const route of ["/auth/sign-in","/auth/sign-in?role=admin"]){
    await page.goto(route);
    await expect(page.getByRole("button",{name:/Continue.*Demo/})).toHaveCount(0);
  }
  await page.goto("/wallet");await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.goto("/admin");await expect(page).toHaveURL(/\/auth\/sign-in/);
});
