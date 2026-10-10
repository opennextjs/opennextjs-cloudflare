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

describe("RegionalCache", () => {
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
