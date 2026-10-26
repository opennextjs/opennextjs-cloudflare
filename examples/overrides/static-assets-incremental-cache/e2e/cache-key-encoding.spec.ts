import { expect, test } from "@playwright/test";

// `/secret/admin` is prerendered and protected by the middleware only.
// Encoded aliases must not be served the protected cache entry.
//
// The cache is read by the cache interceptor (`x-opennext-cache`) when `enableCacheInterception` is set,
// and by the Next.js server (`x-nextjs-cache`) otherwise. The assertions hold for both modes.
test.describe("static-assets-incremental-cache - cache key encoding", () => {
	test("prerendered pages are served from the cache", async ({ request }) => {
		const response = await request.get("/secret/public");
		expect(response.status()).toBe(200);
		const headers = response.headers();
		expect([headers["x-opennext-cache"], headers["x-nextjs-cache"]]).toContain("HIT");
		expect(await response.text()).toContain('data-testid="slug">public</p>');
	});

	test("the middleware protects the page", async ({ request }) => {
		for (const path of ["/secret/admin", "/secret/%61dmin"]) {
			const response = await request.get(path);
			expect(response.status(), path).toBe(401);
		}
	});

	for (const path of [
		"/secret/%2561dmin",
		"/secret/x/%252e%252e/admin",
		"/secret/%252e/admin",
		"/secret/x%5C..%5Cadmin",
	]) {
		test(`the protected cache entry is not served for ${path}`, async ({ request }) => {
			const response = await request.get(path);
			const headers = response.headers();
			expect(headers["x-opennext-cache"]).toBeUndefined();
			expect(["HIT", "STALE"]).not.toContain(headers["x-nextjs-cache"]);
			expect(await response.text()).not.toContain('data-testid="slug">admin</p>');
		});
	}
});
