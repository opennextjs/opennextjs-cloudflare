import { test, expect } from "@playwright/test";

test("the index page of the application shows the Next.js logo", async ({
	page,
}) => {
	await page.goto("http://localhost:8770/");
	await expect(page.getByAltText("Next.js logo")).toBeVisible();
});
