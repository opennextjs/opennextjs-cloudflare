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

	test("Environment variable defined on process.env are not overridden by .env files", async ({ page }) => {
		const res = await page.request.get("/api/env");
		await expect(res.json()).resolves.toEqual(expect.objectContaining({ PROCESS_ENV_VAR: "process.env" }));
	});

	test.describe("remotePatterns", () => {
		test("fetch an image allowed by remotePatterns", async ({ page }) => {
			const res = await page.request.get("/_next/image?url=https://avatars.githubusercontent.com/u/248818");
			expect(res.status()).toBe(200);
			expect(res.headers()).toMatchObject({ "content-type": "image/jpeg" });
		});

		test("400 when fetching an image disallowed by remotePatterns", async ({ page }) => {
			const res = await page.request.get("/_next/image?url=https://avatars.githubusercontent.com/u/248817");
			expect(res.status()).toBe(400);
		});
	});

	test.describe("localPatterns", () => {
		test("fetch an image allowed by localPatterns", async ({ page }) => {
			const res = await page.request.get("/_next/image?url=/snipp/snipp.webp?iscute=yes");
			expect(res.status()).toBe(200);
			expect(res.headers()).toMatchObject({ "content-type": "image/webp" });
		});

		test("400 when fetching an image disallowed by localPatterns with wrong query parameter", async ({
			page,
		}) => {
			const res = await page.request.get("/_next/image?url=/snipp/snipp?iscute=no");
			expect(res.status()).toBe(400);
		});

		test("400 when fetching an image disallowed by localPatterns without query parameter", async ({
			page,
		}) => {
			const res = await page.request.get("/_next/image?url=/snipp/snipp");
			expect(res.status()).toBe(400);
		});
	});
});
