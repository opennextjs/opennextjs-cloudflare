import { test, expect } from "@playwright/test";

test.describe("bugs/gh-219", () => {
	test("the index page of the application shows the Next.js logo", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByAltText("Next.js logo")).toBeVisible();
	});
});
