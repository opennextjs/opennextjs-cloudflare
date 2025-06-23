import { test, expect, type APIResponse } from "@playwright/test";
import type { BinaryLike } from "node:crypto";
import { createHash } from "node:crypto";

test.describe("playground/isr", () => {
	test("Generated pages exist", async ({ page }) => {
		const generatedIds = [1, 2, 3];
		let res: APIResponse;
		for (const id of generatedIds) {
			res = await page.request.get(`/isr/${id}/dynamic`);
			expect(res.status()).toBe(200);
			res = await page.request.get(`/isr/${id}/no-dynamic`);
			expect(res.status()).toBe(200);
		}
	});

	test("Non generated pages 404 when dynamic is false", async ({ page }) => {
		const generatedIds = [4, 5, 6];
		for (const id of generatedIds) {
			const res = await page.request.get(`/isr/${id}/no-dynamic`);
			expect(res.status()).toBe(404);
		}
	});

	test("Non generated pages are generated when dynamic is true", async ({ page }) => {
		const generatedIds = [4, 5, 6];
		for (const id of generatedIds) {
			const res = await page.request.get(`/isr/${id}/dynamic`);
			expect(res.status()).toBe(200);
		}
	});
});
