import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Reads the page and its separately cached data.
 *
 * @param request The Playwright request context.
 * @returns The response, render time, and time the tagged data was generated.
 */
async function getPage(request: APIRequestContext) {
	const response = await request.get("/revalidate-tag");
	expect(response.status()).toBe(200);
	const html = await response.text();
	const renderedAt = Number(html.match(/data-testid="rendered-at">(\d+)</)?.[1]);
	const data = Number(html.match(/data-testid="data">(\d+)</)?.[1]);
	return { response, renderedAt, data };
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
		// The regenerated page must not contain the old unstable_cache (fetch) entry.
		expect(first.data).toBeGreaterThanOrEqual(revalidatedAt);

		// The regenerated page is written after the response: wait until it is served by the cache interceptor.
		// Every response is checked, as a failed assertion inside `toPass` only triggers a retry.
		const reads: Awaited<ReturnType<typeof getPage>>[] = [];
		await expect(async () => {
			const read = await getPage(request);
			reads.push(read);
			expect(read.response.headers()["x-opennext-cache"]).toBe("HIT");
		}).toPass({ timeout: 10_000 });
		// A read racing the write may have regenerated the page again, but never served it stale.
		for (const read of reads) {
			expect(read.renderedAt).toBeGreaterThanOrEqual(first.renderedAt);
			expect(read.data).toBeGreaterThanOrEqual(revalidatedAt);
		}
	});
});
