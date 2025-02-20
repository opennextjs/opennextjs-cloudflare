import { test, expect } from "@playwright/test";

test.describe("ssg-app", () => {
  test("the index page should work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hello from a Statically generated page")).toBeVisible();
  });

  test("the APP_VERSION var from the cloudflare context should be displayed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-version")).toHaveText("1.2.345");
  });

  // Note: secrets from .dev.vars are also part of the SSG output, this is expected and nothing we can avoid
  test("the MY_SECRET secret from the cloudflare context should be displayed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("my-secret")).toHaveText("psst... this is a secret!");
  });
});
