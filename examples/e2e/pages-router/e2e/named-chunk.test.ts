import { expect, test } from "@playwright/test";

// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1326
test("Server side render a component from a named webpack chunk", async ({ page }) => {
	const res = await page.goto("/named-chunk/");
	expect(res?.status()).toBe(200);
	await expect(page.getByTestId("named-chunk")).toHaveText("Rendered from a named webpack chunk");
});

test("Server HTML includes the component from a named webpack chunk", async ({ request }) => {
	const res = await request.get("/named-chunk/");
	expect(res.status()).toBe(200);
	expect(await res.text()).toContain("Rendered from a named webpack chunk");
});
