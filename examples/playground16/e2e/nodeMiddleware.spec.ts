import { expect, test } from "@playwright/test";

// The app uses a Node.js middleware (`proxy.ts`).
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/617
test.describe("Node Middleware", () => {
	test("Node middleware should add headers", async ({ request }) => {
		const resp = await request.get("/");
		expect(resp.status()).toEqual(200);
		const headers = resp.headers();
		expect(headers["x-middleware-test"]).toEqual("1");
		expect(headers["x-random-node"]).toBeDefined();
	});

	test("Node middleware should return json", async ({ request }) => {
		const resp = await request.get("/api/hello");
		expect(resp.status()).toEqual(200);
		const json = await resp.json();
		expect(json).toEqual({ name: "World" });
	});

	test("Node middleware should render an OG image using the fallback font", async ({ request }) => {
		const response = await request.get("/middleware-og");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/png");

		// Consume the stream: rendering errors can occur after the response headers are sent.
		const png = await response.body();
		expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
		expect(png.readUInt32BE(16)).toBe(400);
		expect(png.readUInt32BE(20)).toBe(100);
	});

	test("Node middleware should redirect", async ({ page }) => {
		await page.goto("/redirect");
		await page.waitForURL("/");
		const el = page.getByText("To get started");
		await expect(el).toBeVisible();
	});

	test("Node middleware should rewrite", async ({ page }) => {
		await page.goto("/rewrite");
		const el = page.getByText("To get started");
		await expect(el).toBeVisible();
	});
});
