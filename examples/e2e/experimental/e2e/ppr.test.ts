import { expect, test } from "@playwright/test";

test.describe("PPR", () => {
	test("PPR should show loading first", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("link", { name: "Incremental PPR" }).click();
		await page.waitForURL("/ppr");
		const loading = page.getByText("Loading...");
		await expect(loading).toBeVisible();
		const el = page.getByText("Dynamic Component");
		await expect(el).toBeVisible();
	});

	// Next.js 16.2 dropped `<page>.prefetch.rsc` in favor of per segment prefetches, so the
	// build only emits a `<page>.rsc` for fully static routes. A postponed PPR route has no
	// RSC payload to serve for a whole page prefetch and Next.js answers 404 so that the
	// client falls back to a full navigation - the adapter matches that behavior.
	test("PPR rsc prefetch request should not be served as a whole page", async ({ request }) => {
		const resp = await request.get("/ppr", {
			headers: { rsc: "1", "next-router-prefetch": "1" },
		});
		expect(resp.status()).toEqual(404);
		const headers = resp.headers();
		expect(headers["x-nextjs-postponed"]).toEqual("1");
		expect(headers["x-nextjs-cache"]).toEqual("HIT");
	});

	test("PPR rsc segment prefetch request should be cached", async ({ request }) => {
		const resp = await request.get("/ppr", {
			headers: { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" },
		});
		expect(resp.status()).toEqual(200);
		const headers = resp.headers();
		// "2" identifies a segment prefetch response.
		expect(headers["x-nextjs-postponed"]).toEqual("2");
		expect(headers["x-nextjs-prerender"]).toEqual("1");
		expect(headers["x-nextjs-cache"]).toEqual("HIT");
		expect(headers["cache-control"]).toEqual("s-maxage=31536000");
	});
});
