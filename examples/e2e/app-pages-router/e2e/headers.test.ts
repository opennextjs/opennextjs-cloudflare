import { expect, test } from "@playwright/test";

test("does not set x-opennext-requestid header on cache interceptor response", async ({ page }) => {
	const result = await page.goto("/ssg");
	expect(result).toBeDefined();
	expect(result?.status()).toBe(200);
	const headers = result?.headers();

	// This header should not be defined even when its a cached response from the cache interception in the external middleware
	expect(headers?.["x-opennext-requestid"]).toBeUndefined();
});
