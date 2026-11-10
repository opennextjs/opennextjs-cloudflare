import { error } from "@opennextjs/aws/adapters/logger.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import staticAssetsIncrementalCache from "./static-assets-incremental-cache.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
	error: vi.fn(),
}));

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: vi.fn(),
}));

/**
 * Decodes a URL pathname the way the Workers asset server does to locate the asset.
 *
 * See `decodePath` in `workers-shared/asset-worker/src/handler.ts`.
 *
 * @param pathname The URL pathname.
 * @returns The decoded pathname.
 */
function decodePath(pathname: string): string {
	return pathname
		.split("/")
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				return segment;
			}
		})
		.join("/")
		.replace(/\/+/g, "/");
}

/**
 * Encodes a decoded pathname the way the Workers asset server does to compute the canonical URL.
 *
 * The asset server redirects when the canonical URL differs from the requested one.
 *
 * @param pathname The decoded pathname.
 * @returns The canonical pathname.
 */
function encodePath(pathname: string): string {
	return pathname.split("/").map(encodeURIComponent).join("/");
}

describe("StaticAssetsIncrementalCache", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		vi.stubEnv("OPEN_NEXT_BUILD_ID", "build-id");
		fetchMock = vi.fn(async () => Response.json({ type: "app", html: "cached" }));
		vi.mocked(getCloudflareContext).mockReturnValue({
			env: { ASSETS: { fetch: fetchMock } },
		} as unknown as ReturnType<typeof getCloudflareContext>);
	});

	/**
	 * Calls `get` and returns the URL passed to the assets binding.
	 *
	 * @param key The cache key.
	 * @param cacheType The type of the cache entry.
	 * @returns The fetched URL.
	 */
	async function getFetchedUrl(key: string, cacheType?: "cache" | "fetch"): Promise<URL> {
		await staticAssetsIncrementalCache.get(key, cacheType);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		return new URL(fetchMock.mock.calls[0]![0] as string);
	}

	it("returns the cached value", async () => {
		const result = await staticAssetsIncrementalCache.get("/index");

		expect(result?.value).toEqual({ type: "app", html: "cached" });
	});

	it("does not follow redirects", async () => {
		await staticAssetsIncrementalCache.get("/index");

		expect(fetchMock.mock.calls[0]![1]).toEqual({ redirect: "manual" });
	});

	it("returns null on redirect", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(null, { status: 307, headers: { location: "/cdn-cgi/_next_cache/build-id/a.cache" } })
		);

		expect(await staticAssetsIncrementalCache.get("/a")).toBeNull();
	});

	it("returns null when the entry does not exist", async () => {
		fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

		expect(await staticAssetsIncrementalCache.get("/a")).toBeNull();
	});

	it("builds the URL of a fetch cache entry", async () => {
		const url = await getFetchedUrl("abc123", "fetch");

		expect(url.pathname).toBe("/cdn-cgi/_next_cache/__fetch/build-id/abc123");
	});

	it("does not support composable cache entries", async () => {
		expect(await staticAssetsIncrementalCache.get("/a", "composable")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith("Failed to get from cache", expect.any(Error));
	});

	it("encodes `$` so that the asset server does not redirect", async () => {
		const url = await getFetchedUrl("/route-cache/APP_PAGE/sha/$/journal/slug");

		expect(url.pathname).toBe(
			"/cdn-cgi/_next_cache/build-id/route-cache/APP_PAGE/sha/%24/journal/slug.cache"
		);
	});

	it.each([
		["/route-cache/APP_PAGE/sha/$/admin"],
		["/route-cache/APP_PAGE/sha/$/%61dmin"],
		["/route-cache/APP_PAGE/sha/$/%61dmin/%ZZ"],
		["/route-cache/APP_PAGE/sha/$/x/%2e%2e/admin"],
		["/route-cache/APP_PAGE/sha/$/%2e/admin"],
		["/route-cache/APP_PAGE/sha/$/a%2Fb"],
		["/route-cache/APP_PAGE/sha/$/a%5Cb"],
		["/route-cache/APP_PAGE/sha/$/a\\b"],
		// The URL parser treats `\` as `/`, `x\..\admin` would resolve to `admin`
		["/route-cache/APP_PAGE/sha/$/x\\..\\admin"],
		["/route-cache/APP_PAGE/sha/$/..\\admin"],
		["/route-cache/APP_PAGE/sha/$/q?x=1#h"],
		["/route-cache/APP_PAGE/sha/$/caf\u00e9"],
		["/blog/post-1"],
	])("resolves %s to the exact key without redirect", async (key) => {
		const url = await getFetchedUrl(key);
		const expected = `/cdn-cgi/_next_cache/build-id${key}.cache`;

		// The asset server looks up the decoded path: it must be the key.
		expect(decodePath(url.pathname)).toBe(expected);
		// The asset server redirects when the canonical path differs.
		expect(encodePath(decodePath(url.pathname))).toBe(url.pathname);
	});

	it.each([
		["/route-cache/APP_PAGE/sha/$/x/../admin"],
		["/route-cache/APP_PAGE/sha/$/./admin"],
		["/../admin"],
	])("rejects keys with dot segments %s", async (key) => {
		expect(await staticAssetsIncrementalCache.get(key)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});
});
