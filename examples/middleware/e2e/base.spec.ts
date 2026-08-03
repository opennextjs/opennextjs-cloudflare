import { test, expect } from "@playwright/test";

test.describe("middleware", () => {
	test("redirect", async ({ page }) => {
		await page.goto("/");
		await page.click('[href="/about"]');
		await page.waitForURL("**/redirected");
		expect(await page.textContent("h1")).toContain("Redirected");
	});

	test("rewrite", async ({ page }) => {
		await page.goto("/");
		await page.click('[href="/another"]');
		await page.waitForURL("**/another");
		expect(await page.textContent("h1")).toContain("Rewrite");
	});

	test("no matching middleware", async ({ page }) => {
		await page.goto("/");
		await page.click('[href="/about2"]');
		await page.waitForURL("**/about2");
		expect(await page.textContent("h1")).toContain("About 2");
	});

	test("matching noop middleware", async ({ page }) => {
		await page.goto("/");
		await page.click('[href="/middleware"]');
		await page.waitForURL("**/middleware");
		expect(await page.textContent("h1")).toContain("Via middleware");
	});

	test("malformed paths cannot select protected cached routes", async ({ request }) => {
		const res = await request.get("/%61dmin/%ZZ");

		expect(res.status()).not.toEqual(200);
		expect(res.headers()["x-opennext-cache"]).toBeUndefined();
		expect(await res.text()).not.toContain("Protected content");
	});

	test("middleware matches encoded paths", async ({ request }) => {
		const res = await request.get("/encoded-m%69ddleware");

		expect(res.status()).toEqual(200);
		await expect(res.text()).resolves.toEqual("Middleware matched encoded path");
	});

	// Test for https://github.com/opennextjs/opennextjs-cloudflare/issues/201
	test("clerk middleware", async ({ page }) => {
		const res = await page.request.post("/clerk", { data: "some body" });
		expect(res.ok()).toEqual(true);
		expect(res.status()).toEqual(200);
		await expect(res.text()).resolves.toEqual("Hello clerk");
	});
});
