import { test, expect } from "@playwright/test";

test.describe("next/image with trailing slash", () => {
	test("next/image with trailing slash", async ({ page }) => {
		await page.goto("/image");
		await expect(page.getByAltText("Picture of Tomine")).toBeVisible();
		// The trailing slash should only be there if trailingSlash is enabled in next.config.ts
		expect(await page.getAttribute("img", "src")).toMatch(/^\/_next\/image\//);
	});
});
