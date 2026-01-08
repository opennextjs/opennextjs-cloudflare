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

test.describe("using cloudflare:* modules", () => {
	test("NextConfig", async ({ page }) => {
		const res = await page.request.get("/api/cloudflare");
		expect(res.status()).toEqual(200);
		const { cloudflare, env } = await res.json();
		expect(cloudflare).toBe(true);
		expect(env.NEXTJS_ENV).toEqual("development");
		expect(env.ASSETS).toBeDefined();
	});
});
