import { expect, test } from "@playwright/test";

// `/secret/admin` is prerendered and protected by the middleware only.
// Encoded aliases must not be served the protected entry from the regional cache (Cache API).
test.describe("r2-incremental-cache - regional cache key encoding", () => {
	test("the middleware protects the page", async ({ request }) => {
		for (const path of ["/secret/admin", "/secret/%61dmin"]) {
			const response = await request.get(path);
			expect(response.status(), path).toBe(401);
		}
	});

	test("authorized requests are served the protected page", async ({ request }) => {
		// Also stores the protected entry in the regional cache.
		const response = await request.get("/secret/admin", { headers: { authorization: "Bearer e2e" } });
		expect(response.status()).toBe(200);
		expect(await response.text()).toContain('data-testid="slug">admin</p>');
	});

	for (const path of [
		"/secret/x/%252e%252e/admin",
		"/secret/%252e/admin",
		// Next.js keeps `%5C` and `%23` encoded in the cache key, those are regression guards.
		"/secret/x%5C..%5Cadmin",
		"/secret/admin.cache%23",
	]) {
		test(`the protected entry is not served for ${path}`, async ({ request }) => {
			// Make sure the protected entry is in the regional cache.
			await request.get("/secret/admin", { headers: { authorization: "Bearer e2e" } });

			// Request twice: the first request renders the alias and stores it in the cache (under its own key).
			for (let i = 0; i < 2; i++) {
				const response = await request.get(path);
				expect(await response.text()).not.toContain('data-testid="slug">admin</p>');
			}

			// The protected entry must not have been overwritten.
			const response = await request.get("/secret/admin", { headers: { authorization: "Bearer e2e" } });
			expect(await response.text()).toContain('data-testid="slug">admin</p>');
		});
	}
});
