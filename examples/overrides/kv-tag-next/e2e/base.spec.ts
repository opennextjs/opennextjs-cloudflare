import { test, expect } from "@playwright/test";

test.describe("kv-tag-next", () => {
	test("the index page should work", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("Hello from a Statically generated page")).toBeVisible();
	});

	test("the index page should keep the same date on reload", async ({ page }) => {
		await page.goto("/");
		const date = await page.getByTestId("date-local").textContent();
		expect(date).not.toBeNull();
		await page.reload();
		const newDate = await page.getByTestId("date-local").textContent();
		expect(date).toEqual(newDate);
	});

	test("the index page should revalidate the date on click on revalidateTag", async ({ page }) => {
		await page.goto("/");
		const date = await page.getByTestId("date-fetched").textContent();
		await page.getByTestId("revalidate-tag").click();
		await page.waitForTimeout(100);
		const newDate = await page.getByTestId("date-fetched").textContent();
		expect(date).not.toEqual(newDate);
	});

	test("the index page should revalidate the date on click on revalidatePath", async ({ page }) => {
		await page.goto("/");
		const date = await page.getByTestId("date-fetched").textContent();
		await page.getByTestId("revalidate-path").click();
		await page.waitForTimeout(100);
		const newDate = await page.getByTestId("date-fetched").textContent();
		expect(date).not.toEqual(newDate);
	});

	test("the index page should keep the same date on reload after revalidation", async ({ page }) => {
		await page.goto("/");
		const initialDate = await page.getByTestId("date-fetched").textContent();
		await page.getByTestId("revalidate-tag").click();
		await page.waitForTimeout(100);
		const date = await page.getByTestId("date-fetched").textContent();
		expect(initialDate).not.toEqual(date);
		await page.reload();
		const newDate = await page.getByTestId("date-fetched").textContent();
		expect(date).toEqual(newDate);
	});
});
