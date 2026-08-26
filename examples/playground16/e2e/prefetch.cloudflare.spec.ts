import { expect, test } from "@playwright/test";

test("cache interception serves segment prefetches without retrying indefinitely", async ({ page }) => {
	const segmentPrefetches: string[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname !== "/prefetch/target") {
			return;
		}

		const segment = request.headers()["next-router-segment-prefetch"];
		if (segment) {
			segmentPrefetches.push(segment);
		}
	});

	const routeTreeResponsePromise = page.waitForResponse((response) => {
		const request = response.request();
		return (
			new URL(request.url()).pathname === "/prefetch/target" &&
			request.headers()["next-router-segment-prefetch"] === "/_tree"
		);
	});

	await page.goto("/prefetch");

	const routeTreeResponse = await routeTreeResponsePromise;
	expect(routeTreeResponse.status()).toBe(200);
	expect(routeTreeResponse.headers()).toMatchObject({
		"content-type": "text/x-component",
		"x-nextjs-postponed": "2",
		"x-nextjs-prerender": "1",
		"x-opennext-cache": "HIT",
	});

	await expect.poll(() => segmentPrefetches.some((segment) => segment.endsWith("/__PAGE__"))).toBe(true);
	await page.waitForLoadState("networkidle");

	const settledPrefetchCount = segmentPrefetches.length;
	await page.waitForTimeout(1_000);

	expect(segmentPrefetches).toHaveLength(settledPrefetchCount);
	expect(settledPrefetchCount).toBeLessThan(10);
});
