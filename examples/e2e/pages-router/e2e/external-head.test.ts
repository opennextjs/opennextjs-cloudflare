import { expect, test } from "@playwright/test";

// `<Head>` rendered by a dependency that Next.js keeps external (like `next-seo`).
// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1389
test.describe("next/head from a node_modules dependency", () => {
	test("should render the tags in the server HTML", async ({ request }) => {
		// Assert on the server HTML: the client would add the tags back after hydration.
		const response = await request.get("/external-head");
		expect(response.status()).toBe(200);
		const html = await response.text();
		const head = html.match(/<head>(.*)<\/head>/s)?.[1];
		expect(head).toMatch(/<title[^>]*>OpenNext external head<\/title>/);
		expect(head).toMatch(
			/<meta name="description" content="Head tags rendered by a node_modules dependency"/
		);
	});
});
