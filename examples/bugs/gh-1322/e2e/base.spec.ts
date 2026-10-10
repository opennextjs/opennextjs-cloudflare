import { expect, test } from "@playwright/test";

test.describe("bugs/gh-1322", () => {
	test("pg uses the pg-cloudflare socket on workerd", async ({ page }) => {
		const res = await page.request.get("/api/pg");
		// Check the body first: on failure it carries the error message.
		expect(await res.json()).toEqual({ stream: "CloudflareSocket", startTls: true });
		expect(res.status()).toEqual(200);
	});
});
