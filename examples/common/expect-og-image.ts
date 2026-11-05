import { createHash } from "node:crypto";

import { type APIResponse, expect } from "@playwright/test";

// Next.js 16.3.8 uses Sharp in Node (including prerendering) and resvg WASM in Workers.
// They render the same fixture with slightly different pixels, so check each output exactly.
export const OG_IMAGE_MD5 = {
	node: "db156985b60003a865f90a65670ab5d0",
	workerd: "7b4e705905f98fd94b60e31a1ab12a9d",
} as const;

/**
 * Verifies an OG response's PNG dimensions and exact rendered content.
 *
 * @param response The response from an image endpoint.
 * @param expected The expected dimensions and MD5 of the PNG.
 * @returns Resolves after the complete image body has been checked.
 * @throws When the response body cannot be read or an assertion fails.
 */
export async function expectOgImage(
	response: APIResponse,
	expected: { width: number; height: number; md5: string }
): Promise<void> {
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");

	// Consume the stream: rendering errors can occur after the response headers are sent.
	const png = await response.body();
	expect(png.length).toBeGreaterThanOrEqual(24);
	expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
	expect(png.readUInt32BE(16)).toBe(expected.width);
	expect(png.readUInt32BE(20)).toBe(expected.height);
	expect(createHash("md5").update(png).digest("hex")).toBe(expected.md5);
}
