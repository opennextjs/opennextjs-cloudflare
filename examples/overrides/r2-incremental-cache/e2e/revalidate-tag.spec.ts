import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Requests `/revalidate-tag` and returns the time it was rendered at.
 *
 * @param request The Playwright request context.
 * @returns The response and the render time of the page.
 */
async function getPage(request: APIRequestContext) {
	const response = await request.get("/revalidate-tag");
	expect(response.status()).toBe(200);
	const renderedAt = Number((await response.text()).match(/data-testid="rendered-at">(\d+)</)?.[1]);
	expect(renderedAt).toBeGreaterThan(0);
	return { response, renderedAt };
}

// https://github.com/opennextjs/opennextjs-cloudflare/issues/1295
//
// `/revalidate-tag` is prerendered (stored in R2) and served through the regional cache with
// `bypassTagCacheOnCacheHit` and the cache interceptor.
// The regional cache entry used to be added on a regional cache miss, before the tag cache was checked: a page
// revalidated with `revalidateTag` was then served stale from the regional cache, without the tag cache ever
// being checked again.
//
// There is no cache purge locally: once the page is in the regional cache, revalidating it has no effect.
// The regional cache must be empty when the test starts (see the README), and nothing else must request
// `/revalidate-tag` before it.
// A retry would run against the regional cache filled by the first attempt, and fail like the bug does.
test.describe.configure({ retries: 0 });

test.describe("r2-incremental-cache - revalidateTag with the regional cache", () => {
	test("a page revalidated before it is in the regional cache is not served stale", async ({ request }) => {
		const revalidatedAt = Date.now();
		const revalidate = await request.get("/api/revalidate-tag");
		expect(revalidate.status()).toBe(200);

		// Regional cache miss: the prerendered entry is read from R2, has been revalidated and is regenerated.
		const first = await getPage(request);
		expect(first.renderedAt).toBeGreaterThanOrEqual(revalidatedAt);

		// The regenerated page is served by the cache interceptor, without being regenerated again.
		const second = await getPage(request);
		expect(second.renderedAt).toBe(first.renderedAt);
		expect(second.response.headers()["x-opennext-cache"]).toBe("HIT");
	});
});
