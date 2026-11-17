import type { CacheValue, IncrementalCache, TagCacheResult } from "@opennextjs/aws/types/overrides.js";
import { RequestCache } from "@opennextjs/aws/utils/requestCache.js";
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
	readonly headers = new Map<string, Headers>();

	match = vi.fn(async (url: string) => {
		const body = this.entries.get(FakeCache.normalize(url));
		return body === undefined ? undefined : new Response(body);
	});

	put = vi.fn(async (url: string, response: Response) => {
		this.entries.set(FakeCache.normalize(url), await response.text());
		this.headers.set(FakeCache.normalize(url), response.headers);
	});

	delete = vi.fn(async (url: string) => {
		this.headers.delete(FakeCache.normalize(url));
		return this.entries.delete(FakeCache.normalize(url));
	});

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

const PAGE_KEY = "/index";
const PAGE_URL = "http://cache.local/build-id/index.cache";
const PAGE_TAGS = "_N_T_/layout,_N_T_/page,my-tag";

/**
 * Returns a page value as read from the store.
 *
 * @returns A new page value with its tags in the `x-next-cache-tags` header.
 */
function createPageValue(): CacheValue<"cache"> {
	return {
		type: "app",
		html: "<html></html>",
		rsc: "rsc",
		meta: { status: 200, headers: { "x-next-cache-tags": PAGE_TAGS } },
		revalidate: 60,
	} as CacheValue<"cache">;
}

describe("RegionalCache deferred put", () => {
	let fakeCache: FakeCache;
	let store: { [K in keyof IncrementalCache]: ReturnType<typeof vi.fn> } & { name: string };
	let waitUntilPromises: Promise<unknown>[];

	const FRESH: Omit<TagCacheResult, "key"> = { hasBeenRevalidated: false, isStaleFromTag: false };

	/**
	 * Creates a regional cache wrapping the mock store.
	 *
	 * @param opts Options overriding the defaults of the tests.
	 * @returns The regional cache.
	 */
	function createRegionalCache(opts: Partial<Parameters<typeof withRegionalCache>[1]> = {}) {
		return withRegionalCache(store as unknown as IncrementalCache, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: false,
			bypassTagCacheOnCacheHit: true,
			...opts,
		});
	}

	/**
	 * Waits for all the promises passed to `waitUntil`.
	 */
	async function flushWaitUntil(): Promise<void> {
		while (waitUntilPromises.length > 0) {
			await Promise.all(waitUntilPromises.splice(0));
		}
	}

	/**
	 * Sets up the OpenNext ALS store of a new request.
	 */
	function startRequest(): void {
		const requestStore = { requestCache: new RequestCache() };
		vi.stubGlobal("__openNextAls", { getStore: () => requestStore });
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("OPEN_NEXT_BUILD_ID", "build-id");
		fakeCache = new FakeCache();
		vi.stubGlobal("caches", { open: vi.fn(async () => fakeCache) });
		waitUntilPromises = [];
		vi.mocked(getCloudflareContext).mockReturnValue({
			ctx: { waitUntil: vi.fn((p: Promise<unknown>) => waitUntilPromises.push(p)) },
		} as unknown as ReturnType<typeof getCloudflareContext>);
		store = {
			name: "store",
			get: vi.fn(async () => ({ value: createPageValue(), lastModified: 1000 })),
			set: vi.fn(async () => {}),
			delete: vi.fn(async () => {}),
		};
		startRequest();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	describe("on a regional cache miss", () => {
		it("does not store the entry in the Cache API from get", async () => {
			const regionalCache = createRegionalCache();

			expect((await regionalCache.get(PAGE_KEY))?.value).toEqual(createPageValue());
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it.each([{ isStaleFromTime: undefined }, { isStaleFromTime: false }])(
			"stores the entry with its tags when it is fresh (%o)",
			async ({ isStaleFromTime }) => {
				const regionalCache = createRegionalCache();

				await regionalCache.get(PAGE_KEY);
				await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH, isStaleFromTime });
				await flushWaitUntil();

				expect(fakeCache.put).toHaveBeenCalledTimes(1);
				expect(fakeCache.headers.get(PAGE_URL)?.get("cache-tag")).toBe(PAGE_TAGS);
				expect(fakeCache.headers.get(PAGE_URL)?.get("cache-control")).toBe("max-age=60");
				expect(JSON.parse(fakeCache.entries.get(PAGE_URL)!)).toEqual({
					value: createPageValue(),
					lastModified: 1000,
				});

				// The next request is served from the Cache API.
				startRequest();
				const next = await regionalCache.get(PAGE_KEY);
				expect(store.get).toHaveBeenCalledTimes(1);
				expect(next?.shouldBypassTagCache).toBe(true);
			}
		);

		// Regression test for https://github.com/opennextjs/opennextjs-cloudflare/issues/1295
		it("does not store an entry that has been revalidated", async () => {
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(PAGE_KEY);
			expect(result?.shouldBypassTagCache).toBeUndefined();
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH, hasBeenRevalidated: true });
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();

			// The next request must read the store again and not bypass the tag cache.
			startRequest();
			const next = await regionalCache.get(PAGE_KEY);
			expect(store.get).toHaveBeenCalledTimes(2);
			expect(next?.shouldBypassTagCache).toBeUndefined();
		});

		it.each([
			{ isStaleFromTag: true, isStaleFromTime: undefined },
			{ isStaleFromTag: false, isStaleFromTime: true },
		])("does not store a stale entry (%o)", async (stale) => {
			const regionalCache = createRegionalCache();

			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, hasBeenRevalidated: false, ...stale });
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it("does not store anything when onTagCacheResult is not called", async () => {
			const regionalCache = createRegionalCache();

			await regionalCache.get(PAGE_KEY);
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it("stores the entry as it was read even if the returned value is changed", async () => {
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(PAGE_KEY);
			const value = result!.value as { meta: { headers: Record<string, string> } };
			delete value.meta.headers["x-next-cache-tags"];
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await flushWaitUntil();

			expect(fakeCache.headers.get(PAGE_URL)?.get("cache-tag")).toBe(PAGE_TAGS);
			expect(JSON.parse(fakeCache.entries.get(PAGE_URL)!).value).toEqual(createPageValue());
		});

		it("does not store anything outside of a request", async () => {
			vi.stubGlobal("__openNextAls", undefined);
			const regionalCache = createRegionalCache();

			expect((await regionalCache.get(PAGE_KEY))?.value).toEqual(createPageValue());
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});
	});

	describe("onTagCacheResult", () => {
		it("is a no-op for a key without a pending entry", async () => {
			const regionalCache = createRegionalCache();

			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: "/other", ...FRESH });
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
			expect(getCloudflareContext).not.toHaveBeenCalled();
		});

		it("consumes the pending entry", async () => {
			const regionalCache = createRegionalCache();

			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await flushWaitUntil();

			expect(fakeCache.put).toHaveBeenCalledTimes(1);
		});

		it("stores the entry once per get when the key is read several times in a request", async () => {
			const regionalCache = createRegionalCache();

			// i.e. the cache interceptor falls back to the server which reads the same key again.
			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await flushWaitUntil();

			expect(fakeCache.put).toHaveBeenCalledTimes(2);
			expect(fakeCache.entries.size).toBe(1);
		});

		it("keeps one pending entry per key when the key is read twice before onTagCacheResult", async () => {
			const regionalCache = createRegionalCache();

			// The second read replaces the pending entry of the first one.
			await regionalCache.get(PAGE_KEY);
			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH, hasBeenRevalidated: true });
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});
	});

	describe("on a regional cache hit", () => {
		beforeEach(async () => {
			await createRegionalCache().set(PAGE_KEY, createPageValue());
			fakeCache.put.mockClear();
		});

		it("does not update the Cache API when shouldLazilyUpdateOnCacheHit is false", async () => {
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(PAGE_KEY);
			expect(result?.shouldBypassTagCache).toBe(true);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
			await flushWaitUntil();

			expect(store.get).not.toHaveBeenCalled();
			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it("does not evict a stale entry when shouldLazilyUpdateOnCacheHit is false", async () => {
			const regionalCache = createRegionalCache({ bypassTagCacheOnCacheHit: false });

			await regionalCache.get(PAGE_KEY);
			await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH, isStaleFromTag: true });
			await flushWaitUntil();

			expect(fakeCache.delete).not.toHaveBeenCalled();
			expect(fakeCache.entries.has(PAGE_URL)).toBe(true);
		});

		describe("with shouldLazilyUpdateOnCacheHit", () => {
			it("defers the lazy update until the entry is reported as fresh", async () => {
				const regionalCache = createRegionalCache({
					shouldLazilyUpdateOnCacheHit: true,
					bypassTagCacheOnCacheHit: false,
				});

				const result = await regionalCache.get(PAGE_KEY);
				expect(result?.shouldBypassTagCache).toBe(false);
				await flushWaitUntil();
				expect(store.get).not.toHaveBeenCalled();

				await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...FRESH });
				await flushWaitUntil();

				expect(store.get).toHaveBeenCalledWith(PAGE_KEY, undefined);
				expect(fakeCache.delete).not.toHaveBeenCalled();
				expect(fakeCache.put).toHaveBeenCalledTimes(1);
				expect(fakeCache.headers.get(PAGE_URL)?.get("cache-tag")).toBe(PAGE_TAGS);
			});

			// The store may hold a newer entry than the regional copy, i.e. regenerated in another region.
			it.each([
				{ hasBeenRevalidated: true, isStaleFromTag: false },
				{ hasBeenRevalidated: false, isStaleFromTag: true },
				{ hasBeenRevalidated: false, isStaleFromTag: false, isStaleFromTime: true },
			])("evicts a regional hit that is revalidated or stale (%o)", async (verdict) => {
				const regionalCache = createRegionalCache({
					shouldLazilyUpdateOnCacheHit: true,
					bypassTagCacheOnCacheHit: false,
				});

				await regionalCache.get(PAGE_KEY);
				await regionalCache.onTagCacheResult({ key: PAGE_KEY, ...verdict });
				await flushWaitUntil();

				expect(store.get).not.toHaveBeenCalled();
				expect(fakeCache.put).not.toHaveBeenCalled();
				expect(fakeCache.delete).toHaveBeenCalledWith(PAGE_URL);

				// The next request reads the store.
				startRequest();
				expect(await regionalCache.get(PAGE_KEY)).toEqual({ value: createPageValue(), lastModified: 1000 });
				expect(store.get).toHaveBeenCalledTimes(1);
			});
		});
	});
});
