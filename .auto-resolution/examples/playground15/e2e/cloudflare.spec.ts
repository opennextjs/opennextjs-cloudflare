/**
 * Cloudflare specific tests.
 *
 * The tests in this file do not run on Node (`next dev`).
 */

import { test, expect } from "@playwright/test";

test.describe("playground/cloudflare", () => {
	test("NextConfig", async ({ page }) => {
		const res = await page.request.get("/api/buildid");
		expect(res.status()).toEqual(200);
		const { nextConfig } = await res.json();
		expect(nextConfig.output).toEqual("standalone");
	});
});
