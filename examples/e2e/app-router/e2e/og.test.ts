import { expect, test } from "@playwright/test";

import { expectOgImage, OG_IMAGE_MD5 } from "../../../common/expect-og-image";
import { ogImage } from "../../../common/og-image";

// The API route renders a separate title/SVG fixture.
const API_OG_MD5 = "7e9c67b3c58f7d81b287c64060d9af5d";

test("Open-graph image to be in metatags and present", async ({ page, request }) => {
	await page.goto("/og");

	// Wait for meta tags to be present
	const ogImageSrc = await page.locator('meta[property="og:image"]').getAttribute("content");
	const ogImageAlt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
	const ogImageType = await page.locator('meta[property="og:image:type"]').getAttribute("content");
	const ogImageWidth = await page.locator('meta[property="og:image:width"]').getAttribute("content");
	const ogImageHeight = await page.locator('meta[property="og:image:height"]').getAttribute("content");

	// Verify meta tag exists and is the correct values
	expect(ogImageSrc).not.toBe(null);
	expect(ogImageAlt).toBe(ogImage.text);
	expect(ogImageType).toBe("image/png");
	expect(ogImageWidth).toBe(String(ogImage.size.width));
	expect(ogImageHeight).toBe(String(ogImage.size.height));

	// Check if the image source is working
	const response = await request.get(`/og/${ogImageSrc?.split("/").at(-1)}`);
	expect(response.headers()["cache-control"]).toBe("public, immutable, no-transform, max-age=31536000");
	// The metadata image is prerendered by Next.js using the Node renderer.
	await expectOgImage(response, { ...ogImage.size, md5: OG_IMAGE_MD5.node });
});

test("next/og (vercel/og) to work in API route", async ({ request }) => {
	const response = await request.get("api/og?title=opennext");
	await expectOgImage(response, { width: 1200, height: 630, md5: API_OG_MD5 });
});
