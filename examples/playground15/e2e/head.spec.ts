import { test, expect } from "@playwright/test";

test.describe("head properly populated", () => {
	test("should properly populate the <head>", async ({ page }) => {
		await page.goto("/head");
		const title = await page.title();
		const description = await page.locator('meta[name="description"]').getAttribute("content");
		const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
		expect(title).toBe("SSR Head");
		expect(description).toBe("SSR");
		expect(favicon).toBe("/favicon.ico");
	});

	test("should render the <head> tags from a node_modules dependency on the server", async ({ request }) => {
		// Check the server HTML as the client adds the tags back after hydration.
		const html = await (await request.get("/external-head")).text();
		const head = html.match(/<head>(.*)<\/head>/s)?.[1];
		expect(head).toMatch(/<title[^>]*>External Head<\/title>/);
		expect(head).toMatch(/<meta name="description" content="Rendered by a dependency"/);
	});
});
