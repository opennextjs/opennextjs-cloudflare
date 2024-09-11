import { test, expect } from "@playwright/test";

test("the application's noop index page is visible and it allows navigating to the hello-world api route", async ({
	page,
}) => {
	await page.goto("http://localhost:8770/");
	await expect(page.getByText("This application doesn't have")).toBeVisible();
	await page.getByRole("link", { name: "/api/hello" }).click();
	await expect(page.getByText("Hello World!")).toBeVisible();
});

test("the hello-world api route works as intended", async ({ page }) => {
	const res = await fetch("http://localhost:8770/api/hello");
	expect(res.headers.get("content-type")).toContain("text/plain");
	expect(await res.text()).toEqual("Hello World!");
});
