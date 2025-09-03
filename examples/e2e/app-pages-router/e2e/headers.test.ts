import { expect, test } from "@playwright/test";

test("should test if poweredByHeader adds the correct headers ", async ({ page }) => {
	const result = await page.goto("/ssg");
	expect(result).toBeDefined();
	expect(result?.status()).toBe(200);
	const headers = result?.headers();

	// This header should not be defined even when cache interception happens in the external middleware
	expect(headers?.["x-opennext-requestid"]).toBeFalsy();

	await page.waitForTimeout(2000); // Wait 2s

	const result2 = await page.goto("/ssg");
	expect(result2).toBeDefined();
	expect(result2?.status()).toBe(200);
	const headers2 = result2?.headers();

	expect(headers2?.["x-opennext-requestid"]).toBeFalsy();
});
