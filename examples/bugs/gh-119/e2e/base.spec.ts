import { test, expect } from "@playwright/test";

test.describe("bugs/gh-119", () => {
	test("the index page of the application shows Hello World", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("Hello World")).toBeVisible();
	});
});
