import { test, expect } from "@playwright/test";

test.describe("create-next-app", () => {
  test("the index page of the application shows the Next.js logo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByAltText("Next.js logo")).toBeVisible();
  });
});
