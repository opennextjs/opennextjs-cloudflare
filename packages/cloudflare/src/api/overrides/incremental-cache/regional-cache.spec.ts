import type { CacheValue, IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { withRegionalCache } from "./regional-cache.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
	error: vi.fn(),
}));

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: vi.fn(),
}));

/**
 * Minimal in-memory implementation of the Cache API.
 *
 * Request URLs are parsed like the Cache API does: dot segments and `\` are resolved and the fragment is dropped.
 */
class FakeCache {
	readonly entries = new Map<string, string>();

	match = vi.fn(async (url: string) => {
		const body = this.entries.get(FakeCache.normalize(url));
		return body === undefined ? undefined : new Response(body);
	});

	put = vi.fn(async (url: string, response: Response) => {
		this.entries.set(FakeCache.normalize(url), await response.text());
	});

	delete = vi.fn(async (url: string) => this.entries.delete(FakeCache.normalize(url)));

	/**
	 * Returns the URL used to identify a cache entry.
	 *
	 * @param url The request URL.
	 * @returns The parsed URL without the fragment.
	 */
	static normalize(url: string): string {
		const parsed = new URL(url);
		parsed.hash = "";
		return parsed.href;
	}
}

/**
 * Decodes each segment of a URL pathname.
 *
 * @param pathname The URL pathname.
 * @returns The decoded pathname.
 */
function decodePath(pathname: string): string {
	return pathname.split("/").map(decodeURIComponent).join("/");
}

const ADMIN_KEY = "/route-cache/APP_PAGE/sha/$/admin";
const ADMIN_VALUE = { type: "app", html: "admin" } as CacheValue<"cache">;

describe("RegionalCache", () => {
	let fakeCache: FakeCache;
	let store: { [K in keyof IncrementalCache]: ReturnType<typeof vi.fn> } & { name: string };
	let regionalCache: ReturnType<typeof withRegionalCache>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("OPEN_NEXT_BUILD_ID", "build-id");
		fakeCache = new FakeCache();
		vi.stubGlobal("caches", { open: vi.fn(async () => fakeCache) });
		vi.mocked(getCloudflareContext).mockReturnValue({
			ctx: { waitUntil: vi.fn() },
		} as unknown as ReturnType<typeof getCloudflareContext>);
		store = {
			name: "store",
			get: vi.fn(async () => null),
			set: vi.fn(async () => {}),
			delete: vi.fn(async () => {}),
		};
		regionalCache = withRegionalCache(store as unknown as IncrementalCache, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: false,
			bypassTagCacheOnCacheHit: false,
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	/**
	 * Calls `set` and returns the URL passed to the Cache API.
	 *
	 * @param key The cache key.
	 * @returns The Cache API URL.
	 */
	async function getPutUrl(key: string): Promise<string> {
		await regionalCache.set(key, ADMIN_VALUE);
		expect(fakeCache.put).toHaveBeenCalledTimes(1);
		return fakeCache.put.mock.calls[0]![0] as string;
	}

	it("returns the entry from the Cache API", async () => {
		await regionalCache.set(ADMIN_KEY, ADMIN_VALUE);

		expect((await regionalCache.get(ADMIN_KEY))?.value).toEqual(ADMIN_VALUE);
		expect(store.get).not.toHaveBeenCalled();
	});

	it("encodes `$` in the URL", async () => {
		expect(await getPutUrl("/route-cache/APP_PAGE/sha/$/journal/slug")).toBe(
			"http://cache.local/build-id/route-cache/APP_PAGE/sha/%24/journal/slug.cache"
		);
	});

	it("uses the cache type as the extension", async () => {
		await regionalCache.set("abc123", ADMIN_VALUE, "fetch");

		expect(fakeCache.put.mock.calls[0]![0]).toBe("http://cache.local/build-id/abc123.fetch");
	});

	it.each([
		["/route-cache/APP_PAGE/sha/$/admin"],
		["/route-cache/APP_PAGE/sha/$/%61dmin"],
		["/route-cache/APP_PAGE/sha/$/%61dmin/%ZZ"],
		["/route-cache/APP_PAGE/sha/$/x/%2e%2e/admin"],
		["/route-cache/APP_PAGE/sha/$/%2e/admin"],
		["/route-cache/APP_PAGE/sha/$/a%2Fb"],
		["/route-cache/APP_PAGE/sha/$/a\\b"],
		// The URL parser treats `\` as `/`, `x\..\admin` would resolve to `admin`
		["/route-cache/APP_PAGE/sha/$/x\\..\\admin"],
		["/route-cache/APP_PAGE/sha/$/..\\admin"],
		["/route-cache/APP_PAGE/sha/$/q?x=1#h"],
		["/route-cache/APP_PAGE/sha/$/admin.cache#"],
		["/route-cache/APP_PAGE/sha/$/caf\u00e9"],
		["/blog/post-1"],
	])("uses a URL that is not altered by the URL parser for %s", async (key) => {
		const url = await getPutUrl(key);
		const parsed = new URL(url);

		expect(parsed.href).toBe(url);
		expect(parsed.search).toBe("");
		expect(parsed.hash).toBe("");
		expect(decodePath(parsed.pathname)).toBe(`/build-id${key}.cache`);
	});

	it.each([
		["/route-cache/APP_PAGE/sha/$/x/%2e%2e/admin"],
		["/route-cache/APP_PAGE/sha/$/%2e/admin"],
		["/route-cache/APP_PAGE/sha/$/%2E%2E/$/admin"],
		["/route-cache/APP_PAGE/sha/$/x\\..\\admin"],
		["/route-cache/APP_PAGE/sha/$/x/%2e%2e\\admin"],
		["/route-cache/APP_PAGE/sha/$/admin.cache#"],
	])("does not return the entry of a different key for %s", async (key) => {
		await regionalCache.set(ADMIN_KEY, ADMIN_VALUE);

		expect(await regionalCache.get(key)).toBeNull();
		expect(store.get).toHaveBeenCalledWith(key, undefined);
	});

	it.each([["/route-cache/APP_PAGE/sha/$/x/%2e%2e/admin"], ["/route-cache/APP_PAGE/sha/$/x\\..\\admin"]])(
		"does not overwrite the entry of a different key for %s",
		async (key) => {
			await regionalCache.set(ADMIN_KEY, ADMIN_VALUE);
			await regionalCache.set(key, { type: "app", html: "attacker" } as CacheValue<"cache">);

			expect((await regionalCache.get(ADMIN_KEY))?.value).toEqual(ADMIN_VALUE);
		}
	);

	describe("keys with dot segments", () => {
		const keys = [
			["/route-cache/APP_PAGE/sha/$/x/../admin"],
			["/route-cache/APP_PAGE/sha/$/./admin"],
			["/../admin"],
		];

		it.each(keys)("reads %s from the store only", async (key) => {
			await regionalCache.set(ADMIN_KEY, ADMIN_VALUE);
			store.get.mockResolvedValueOnce({ value: { type: "app", html: "store" }, lastModified: 1 });

			expect((await regionalCache.get(key))?.value).toEqual({ type: "app", html: "store" });
			expect(fakeCache.match).not.toHaveBeenCalled();
			expect(store.get).toHaveBeenCalledWith(key, undefined);
		});

		it.each(keys)("writes %s to the store only", async (key) => {
			await regionalCache.set(key, ADMIN_VALUE);

			expect(store.set).toHaveBeenCalledWith(key, ADMIN_VALUE, undefined);
			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it.each(keys)("deletes %s from the store only", async (key) => {
			await regionalCache.delete(key);

			expect(store.delete).toHaveBeenCalledWith(key);
			expect(fakeCache.delete).not.toHaveBeenCalled();
		});
	});
});
