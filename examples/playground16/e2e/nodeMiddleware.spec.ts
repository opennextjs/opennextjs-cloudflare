import { expect, test } from "@playwright/test";

import { expectOgImage, OG_IMAGE_MD5 } from "../../common/expect-og-image";
import { ogImage } from "../../common/og-image";

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

	test("Node middleware should render an OG image using the fallback font", async ({ request }, testInfo) => {
		const response = await request.get("/middleware-og");
		const md5 = testInfo.config.metadata.isWorker ? OG_IMAGE_MD5.workerd : OG_IMAGE_MD5.node;
		await expectOgImage(response, { ...ogImage.size, md5 });
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
