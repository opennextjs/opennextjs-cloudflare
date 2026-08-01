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

	test("PPR rsc prefetch request should be cached", async ({ request }) => {
		await request.get("/ppr", {
			headers: { rsc: "1", "next-router-prefetch": "1" },
		});
		const resp = await request.get("/ppr", {
			headers: { rsc: "1", "next-router-prefetch": "1" },
		});
		expect(resp.status()).toEqual(200);
		const headers = resp.headers();
		expect(headers["x-nextjs-postponed"]).toEqual("1");
		expect(headers["x-nextjs-cache"]).toEqual("HIT");
		expect(headers["cache-control"]).toEqual("s-maxage=31536000");
	});

	test("dynamic PPR fallback should resume with route params", async ({ page }) => {
		const response = await page.goto("/ppr/first");

		expect(response?.status()).toEqual(200);
		await expect(page.getByTestId("static-shell")).toBeVisible();
		await expect(page.getByTestId("dynamic-slug")).toHaveText("Dynamic slug: first");
	});

	test("dynamic PPR responses stream the shell and resumed content on cold and warm requests", async ({
		request,
	}) => {
		for (const path of ["/ppr/first", "/ppr/first", "/ppr/second"]) {
			const response = await request.get(path);
			const body = await response.text();

			expect(response.status()).toEqual(200);
			expect(body).toContain("Static shell");
			expect(body.replaceAll("<!-- -->", "")).toContain(`Dynamic slug: ${path.split("/").at(-1)}`);
			expect(body).toContain("self.__next_f.push");
			expect(body).toMatch(/\$(?:RC|RS|RX)\b/);
		}
	});

	test("dynamic PPR supports route and segment prefetch requests", async ({ request }) => {
		for (const headers of [
			{ rsc: "1", "next-router-prefetch": "1" },
			{
				rsc: "1",
				"next-router-prefetch": "1",
				"next-router-segment-prefetch": "/_tree",
			},
		]) {
			const response = await request.get("/ppr/first", { headers });

			expect(response.status()).toEqual(200);
			expect(response.headers()["content-type"]).toContain("text/x-component");
			expect((await response.body()).byteLength).toBeGreaterThan(0);
		}
	});

	test("client navigation can transition between dynamic PPR params", async ({ page }) => {
		await page.goto("/ppr/first");
		await expect(page.getByTestId("dynamic-slug")).toHaveText("Dynamic slug: first");

		await page.getByRole("link", { name: "Second item" }).click();
		await page.waitForURL("/ppr/second");
		await expect(page.getByText("Dynamic slug: second", { exact: true })).toBeVisible();
		expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toEqual(1);
	});
});
