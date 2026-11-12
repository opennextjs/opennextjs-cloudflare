import type { CacheValue, IncrementalCache, NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { withRegionalCache } from "./regional-cache.js";

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
	error: vi.fn(),
}));

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("../internal.js", () => ({
	debugCache: vi.fn(),
	FALLBACK_BUILD_ID: "fallback-build-id",
	isPurgeCacheEnabled: () => true,
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

const KEY = "/index";
const TAGS = ["_N_T_/layout", "_N_T_/page", "_N_T_/", "my-tag"];
const URL_KEY = `http://cache.local/fallback-build-id${KEY}.cache`;

type StoredResponse = { body: string; headers: Headers };

function createMockCache() {
	const entries = new Map<string, StoredResponse>();
	return {
		entries,
		match: vi.fn(async (url: string) => {
			const entry = entries.get(url);
			return entry ? new Response(entry.body, { headers: entry.headers }) : undefined;
		}),
		put: vi.fn(async (url: string, response: Response) => {
			entries.set(url, { body: await response.text(), headers: response.headers });
		}),
		delete: vi.fn(async (url: string) => entries.delete(url)),
	};
}

function createPageValue(): CacheValue<"cache"> {
	return {
		type: "app",
		html: "<html></html>",
		rsc: "rsc",
		meta: {
			status: 200,
			headers: { "x-next-cache-tags": TAGS.join(",") },
		},
		revalidate: 60,
	};
}

/**
 * Mimics `getTagsFromValue` from `@opennextjs/aws` which deletes the tags header from the value.
 */
function stripTags(value: CacheValue<"cache">) {
	if (value.type === "app" || value.type === "page" || value.type === "route") {
		delete value.meta?.headers?.["x-next-cache-tags"];
	}
}

describe("RegionalCache refill", () => {
	let mockCache: ReturnType<typeof createMockCache>;
	let store: {
		name: string;
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	let tagCache: {
		mode: "nextMode";
		name: string;
		hasBeenRevalidated: ReturnType<typeof vi.fn>;
		isStale: ReturnType<typeof vi.fn>;
		getLastRevalidated: ReturnType<typeof vi.fn>;
		writeTags: ReturnType<typeof vi.fn>;
	};
	let waitUntilPromises: Promise<unknown>[];

	const flushWaitUntil = async () => {
		while (waitUntilPromises.length > 0) {
			await Promise.all(waitUntilPromises.splice(0));
		}
	};

	const createRegionalCache = (opts: Partial<Parameters<typeof withRegionalCache>[1]> = {}) =>
		withRegionalCache(store as unknown as IncrementalCache, {
			mode: "long-lived",
			bypassTagCacheOnCacheHit: true,
			shouldLazilyUpdateOnCacheHit: false,
			...opts,
		});

	beforeEach(() => {
		mockCache = createMockCache();
		vi.stubGlobal("caches", { open: vi.fn(async () => mockCache) });

		waitUntilPromises = [];
		vi.mocked(getCloudflareContext).mockReturnValue({
			ctx: { waitUntil: (p: Promise<unknown>) => waitUntilPromises.push(p) },
		} as unknown as ReturnType<typeof getCloudflareContext>);

		store = {
			name: "mock-store",
			get: vi.fn(async () => ({ value: createPageValue(), lastModified: 1000 })),
			set: vi.fn(async () => {}),
			delete: vi.fn(async () => {}),
		};

		tagCache = {
			mode: "nextMode",
			name: "mock-tag-cache",
			hasBeenRevalidated: vi.fn(async () => false),
			isStale: vi.fn(async () => false),
			getLastRevalidated: vi.fn(async () => 0),
			writeTags: vi.fn(async () => {}),
		};
		globalThis.tagCache = tagCache as unknown as NextModeTagCache;
		globalThis.openNextConfig = {};
		globalThis.nextVersion = "16.0.0";
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("get on a regional cache miss", () => {
		it("does not seed the regional cache with an entry that has been revalidated", async () => {
			tagCache.hasBeenRevalidated.mockResolvedValue(true);
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(result?.shouldBypassTagCache).toBeUndefined();
			expect(tagCache.hasBeenRevalidated).toHaveBeenCalledWith(TAGS, 1000);
			expect(mockCache.put).not.toHaveBeenCalled();

			// The next request must not be served from the regional cache with the tag cache bypassed.
			const next = await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(store.get).toHaveBeenCalledTimes(2);
			expect(next?.shouldBypassTagCache).toBeUndefined();
			expect(mockCache.put).not.toHaveBeenCalled();
		});

		it("does not seed the regional cache with an entry that is stale (SWR revalidateTag)", async () => {
			tagCache.isStale.mockResolvedValue(true);
			const regionalCache = createRegionalCache();

			await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(tagCache.isStale).toHaveBeenCalledWith(TAGS, 1000);
			expect(mockCache.put).not.toHaveBeenCalled();
		});

		it("seeds the regional cache with an entry that has not been revalidated", async () => {
			const regionalCache = createRegionalCache();

			await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(mockCache.put).toHaveBeenCalledTimes(1);
			expect(mockCache.entries.get(URL_KEY)?.headers.get("cache-tag")).toBe(TAGS.join(","));

			const next = await regionalCache.get(KEY, "cache");

			expect(store.get).toHaveBeenCalledTimes(1);
			expect(next?.shouldBypassTagCache).toBe(true);
		});

		it("removes the entry when the tag is revalidated while it is being stored", async () => {
			// The first check passes, then `revalidateTag` completes (and purges) before the write lands.
			tagCache.hasBeenRevalidated.mockResolvedValueOnce(false).mockResolvedValue(true);
			const regionalCache = createRegionalCache();

			await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(tagCache.hasBeenRevalidated).toHaveBeenCalledTimes(2);
			expect(mockCache.put).toHaveBeenCalledTimes(1);
			expect(mockCache.entries.has(URL_KEY)).toBe(false);

			const next = await regionalCache.get(KEY, "cache");
			expect(store.get).toHaveBeenCalledTimes(2);
			expect(next?.shouldBypassTagCache).toBeUndefined();
		});

		it("keeps a newer entry stored by a concurrent set when the tag is revalidated during the refill", async () => {
			const regionalCache = createRegionalCache();
			const newer = { body: '{"newer":true}', headers: new Headers() };
			tagCache.hasBeenRevalidated.mockResolvedValueOnce(false).mockImplementation(async () => {
				// A concurrent `set` regenerated the page after the refill was written.
				mockCache.entries.set(URL_KEY, newer);
				return true;
			});

			await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(mockCache.delete).not.toHaveBeenCalled();
			expect(mockCache.entries.get(URL_KEY)).toBe(newer);
		});

		it("does not consult the tag cache when the tag cache is not bypassed on hits", async () => {
			tagCache.hasBeenRevalidated.mockResolvedValue(true);
			const regionalCache = createRegionalCache({ bypassTagCacheOnCacheHit: false });

			await regionalCache.get(KEY, "cache");
			await flushWaitUntil();

			expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
			expect(mockCache.put).toHaveBeenCalledTimes(1);

			// The tag cache is checked by `@opennextjs/aws` on every hit.
			const next = await regionalCache.get(KEY, "cache");
			expect(next?.shouldBypassTagCache).toBe(false);
		});

		it.each([true, false])(
			"stores the tags even when the caller strips them from the returned value (bypassTagCacheOnCacheHit: %s)",
			async (bypassTagCacheOnCacheHit) => {
				const regionalCache = createRegionalCache({ bypassTagCacheOnCacheHit });

				const result = await regionalCache.get(KEY, "cache");
				// `@opennextjs/aws` reads (and deletes) the tags from the value right after `get` returns.
				stripTags(result!.value!);
				await flushWaitUntil();

				const stored = mockCache.entries.get(URL_KEY);
				expect(stored?.headers.get("cache-tag")).toBe(TAGS.join(","));
				expect(JSON.parse(stored!.body).value.meta.headers["x-next-cache-tags"]).toBe(TAGS.join(","));
			}
		);
	});

	describe("putToCache", () => {
		it("stores the entry with its tags even if they are removed from the value while the cache opens", async () => {
			const regionalCache = createRegionalCache();
			const value = createPageValue();

			vi.spyOn(
				regionalCache as unknown as { getCacheInstance: () => Promise<Cache> },
				"getCacheInstance"
			).mockImplementation(async () => {
				// Another code path strips the tags from the shared value while the cache is opening.
				stripTags(value);
				await new Promise((resolve) => setTimeout(resolve, 0));
				return mockCache as unknown as Cache;
			});

			await regionalCache.set(KEY, value, "cache");

			expect(store.set).toHaveBeenCalledWith(KEY, value, "cache");
			const stored = mockCache.entries.get(URL_KEY);
			expect(stored?.headers.get("cache-tag")).toBe(TAGS.join(","));
			expect(stored?.headers.get("cache-control")).toBe("max-age=60");
			expect(JSON.parse(stored!.body).value.meta.headers["x-next-cache-tags"]).toBe(TAGS.join(","));
		});
	});
});
