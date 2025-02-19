import { test, expect } from "@playwright/test";

test("the index page should work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Hello from a Statically generated page")).toBeVisible();
});
