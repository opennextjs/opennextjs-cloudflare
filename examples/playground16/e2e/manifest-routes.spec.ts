import { expect, test } from "@playwright/test";

// Regression test for https://github.com/opennextjs/opennextjs-cloudflare/issues/1360:
// route directories matching manifest globs must not be treated as manifest files.
test.describe("manifest-like route directories", () => {
	for (const route of ["/mail-manifest.json", "/index_client-reference-manifest.js"]) {
		test(`${route} remains available`, async ({ request }) => {
			const response = await request.get(route);

			expect(response.status()).toBe(200);
			await expect(response.json()).resolves.toEqual({ route });
		});
	}
});
