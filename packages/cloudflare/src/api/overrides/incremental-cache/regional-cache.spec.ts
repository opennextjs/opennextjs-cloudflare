import type {
	CacheValue,
	IncrementalCache,
	TagCacheResult,
	WithLastModified,
} from "@opennextjs/aws/types/overrides.js";
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

	// Completes on a later macrotask, so that a deletion that is not awaited completes after the next operations.
	delete = vi.fn(async (url: string) => {
		await new Promise((resolve) => setTimeout(resolve, 0));
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
const FETCH_URL = "http://cache.local/build-id/index.fetch";
const PAGE_TAGS = "_N_T_/layout,_N_T_/page,my-tag";

const FRESH: TagCacheResult = { hasBeenRevalidated: false, isStaleFromTag: false };
const REVALIDATED: TagCacheResult = { hasBeenRevalidated: true, isStaleFromTag: false };

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

/**
 * Reports a tag cache verdict to an entry returned by `get`, as OpenNext does.
 *
 * @param entry The entry returned by `get`.
 * @param result The tag cache verdict.
 * @throws When the entry has no `onTagCacheResult` callback.
 */
async function report(entry: WithLastModified<unknown> | null, result: TagCacheResult): Promise<void> {
	const callback = entry?.onTagCacheResult;
	if (!callback) {
		throw new Error("The entry has no onTagCacheResult callback");
	}
	await callback(result);
}

describe("RegionalCache deferred put", () => {
	let fakeCache: FakeCache;
	let store: { [K in keyof IncrementalCache]: ReturnType<typeof vi.fn> } & { name: string };
	let waitUntilPromises: Promise<unknown>[];

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
		const requestStore = {};
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
		it("reports the verdict to the wrapped store even when the regional fill fails", async () => {
			const onTagCacheResult = vi.fn();
			const entry = { value: createPageValue(), lastModified: 1000, onTagCacheResult };
			store.get.mockResolvedValue(entry);
			const regionalCache = createRegionalCache();
			const read = await regionalCache.get(PAGE_KEY);
			const failure = new Error("no execution context");
			vi.mocked(getCloudflareContext).mockImplementationOnce(() => {
				throw failure;
			});

			await expect(report(read, FRESH)).rejects.toThrow(failure);
			expect(onTagCacheResult).toHaveBeenCalledExactlyOnceWith(FRESH);
			expect(onTagCacheResult.mock.contexts[0]).toBe(entry);
		});

		it.each([PAGE_KEY, "/a/../b"])("forwards a rejected verdict for a store read of %s", async (key) => {
			const onTagCacheResult = vi.fn();
			store.get.mockResolvedValue({ value: createPageValue(), lastModified: 1000, onTagCacheResult });
			const read = await createRegionalCache().get(key);

			await report(read, REVALIDATED);
			expect(onTagCacheResult).toHaveBeenCalledExactlyOnceWith(REVALIDATED);
			expect(fakeCache.put).not.toHaveBeenCalled();
		});

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

				await report(await regionalCache.get(PAGE_KEY), { ...FRESH, isStaleFromTime });
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

		it("stores a fetch entry at its URL", async () => {
			const regionalCache = createRegionalCache();

			await report(await regionalCache.get(PAGE_KEY, "fetch"), FRESH);
			await flushWaitUntil();

			expect(store.get).toHaveBeenCalledWith(PAGE_KEY, "fetch");
			expect([...fakeCache.entries.keys()]).toEqual([FETCH_URL]);
		});

		// Regression test for https://github.com/opennextjs/opennextjs-cloudflare/issues/1295
		it("does not store an entry that has been revalidated", async () => {
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(PAGE_KEY);
			expect(result?.shouldBypassTagCache).toBeUndefined();
			await report(result, REVALIDATED);
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

			await report(await regionalCache.get(PAGE_KEY), { hasBeenRevalidated: false, ...stale });
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it("stores the entry as it was when the verdict was reported", async () => {
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(PAGE_KEY);
			const reported = report(result, FRESH);
			// Next.js may change the entry as soon as the callback has been called.
			const value = result!.value as { meta: { headers: Record<string, string> } };
			delete value.meta.headers["x-next-cache-tags"];
			await reported;
			await flushWaitUntil();

			expect(fakeCache.headers.get(PAGE_URL)?.get("cache-tag")).toBe(PAGE_TAGS);
			expect(JSON.parse(fakeCache.entries.get(PAGE_URL)!).value).toEqual(createPageValue());
		});

		it("returns the entry when it can not be stored in the Cache API", async () => {
			// A tag that is not a valid header value.
			const value = {
				...createPageValue(),
				meta: { status: 200, headers: { "x-next-cache-tags": "a\nb" } },
			} as CacheValue<"cache">;
			store.get.mockResolvedValue({ value, lastModified: 1000 });
			const regionalCache = createRegionalCache();

			const result = await regionalCache.get(PAGE_KEY);
			expect(result).toMatchObject({ value, lastModified: 1000 });
			await report(result, FRESH);
			await expect(flushWaitUntil()).rejects.toThrow();

			expect(fakeCache.put).not.toHaveBeenCalled();
		});

		it("does not store the entry outside of a request but forwards the verdict to the wrapped store", async () => {
			vi.stubGlobal("__openNextAls", { getStore: () => undefined });
			const onTagCacheResult = vi.fn();
			store.get.mockResolvedValue({ value: createPageValue(), lastModified: 1000, onTagCacheResult });

			await report(await createRegionalCache().get(PAGE_KEY), FRESH);
			await flushWaitUntil();

			expect(onTagCacheResult).toHaveBeenCalledExactlyOnceWith(FRESH);
			expect(fakeCache.put).not.toHaveBeenCalled();
		});
	});

	describe("on a regional cache hit", () => {
		beforeEach(async () => {
			await createRegionalCache().set(PAGE_KEY, createPageValue());
			fakeCache.put.mockClear();
		});

		it("neither updates nor evicts the entry when shouldLazilyUpdateOnCacheHit is false", async () => {
			const regionalCache = createRegionalCache({ bypassTagCacheOnCacheHit: false });

			const result = await regionalCache.get(PAGE_KEY);
			expect(result?.shouldBypassTagCache).toBe(false);
			// Neither updated nor evicted, i.e. when it is reported as stale or revalidated.
			expect(result?.onTagCacheResult).toBeUndefined();
			await flushWaitUntil();

			expect(store.get).not.toHaveBeenCalled();
			expect(fakeCache.put).not.toHaveBeenCalled();
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

				await report(result, FRESH);
				await flushWaitUntil();

				expect(store.get).toHaveBeenCalledWith(PAGE_KEY, undefined);
				expect(fakeCache.delete).not.toHaveBeenCalled();
				expect(fakeCache.put).toHaveBeenCalledTimes(1);
				expect(fakeCache.headers.get(PAGE_URL)?.get("cache-tag")).toBe(PAGE_TAGS);
			});

			// Their staleness is detected again on every read.
			it.each([{ isStaleFromTag: true }, { isStaleFromTag: false, isStaleFromTime: true }])(
				"updates a stale regional hit from the store (%o)",
				async (stale) => {
					const regionalCache = createRegionalCache({
						shouldLazilyUpdateOnCacheHit: true,
						bypassTagCacheOnCacheHit: false,
					});

					await report(await regionalCache.get(PAGE_KEY), { hasBeenRevalidated: false, ...stale });
					await flushWaitUntil();

					expect(fakeCache.delete).not.toHaveBeenCalled();
					expect(store.get).toHaveBeenCalledTimes(1);

					// The next request gets the entry of the store from the Cache API.
					startRequest();
					expect((await regionalCache.get(PAGE_KEY))?.lastModified).toBe(1000);
					expect(store.get).toHaveBeenCalledTimes(1);
				}
			);

			// The store may hold a newer entry than the regional copy, i.e. regenerated in another region.
			it("evicts a regional hit that has been revalidated", async () => {
				const regionalCache = createRegionalCache({
					shouldLazilyUpdateOnCacheHit: true,
					bypassTagCacheOnCacheHit: false,
				});

				await report(await regionalCache.get(PAGE_KEY), REVALIDATED);
				// Evicted when OpenNext gets control back, before Next.js can regenerate the entry.
				expect(fakeCache.entries.has(PAGE_URL)).toBe(false);
				await flushWaitUntil();

				expect(store.get).not.toHaveBeenCalled();
				expect(fakeCache.put).not.toHaveBeenCalled();

				// The next request reads the store.
				startRequest();
				expect((await regionalCache.get(PAGE_KEY))?.lastModified).toBe(1000);
				expect(store.get).toHaveBeenCalledTimes(1);
			});

			it("updates and evicts a fetch entry at its URL", async () => {
				const regionalCache = createRegionalCache({
					shouldLazilyUpdateOnCacheHit: true,
					bypassTagCacheOnCacheHit: false,
				});
				await regionalCache.set(PAGE_KEY, createPageValue(), "fetch");

				await report(await regionalCache.get(PAGE_KEY, "fetch"), FRESH);
				await flushWaitUntil();

				expect(store.get).toHaveBeenCalledWith(PAGE_KEY, "fetch");
				expect(JSON.parse(fakeCache.entries.get(FETCH_URL)!).lastModified).toBe(1000);

				await report(await regionalCache.get(PAGE_KEY, "fetch"), REVALIDATED);

				expect(fakeCache.entries.has(FETCH_URL)).toBe(false);
				// The page entry of the same key is kept.
				expect(fakeCache.entries.has(PAGE_URL)).toBe(true);
			});

			it("neither updates nor evicts the entry outside of a request", async () => {
				vi.stubGlobal("__openNextAls", undefined);
				const regionalCache = createRegionalCache({
					shouldLazilyUpdateOnCacheHit: true,
					bypassTagCacheOnCacheHit: false,
				});

				expect((await regionalCache.get(PAGE_KEY))?.onTagCacheResult).toBeUndefined();
			});
		});
	});

	// Each verdict is reported to the entry it is about, overlapping reads can not be misassociated.
	describe("overlapping reads of a key in a request", () => {
		/**
		 * Returns a store entry for a version of the page.
		 *
		 * @param lastModified The version of the entry.
		 * @returns The entry as returned by the store.
		 */
		function createStoreEntry(lastModified: number) {
			return { value: createPageValue(), lastModified };
		}

		it.each([
			{ order: "fresh, then revalidated", newFirst: true },
			{ order: "revalidated, then fresh", newFirst: false },
		])("stores the fresh entry of two different entries ($order)", async ({ newFirst }) => {
			const regionalCache = createRegionalCache();
			// i.e. the entry is regenerated between the two reads.
			store.get.mockResolvedValueOnce(createStoreEntry(1000)).mockResolvedValueOnce(createStoreEntry(2000));

			const oldRead = await regionalCache.get(PAGE_KEY);
			const newRead = await regionalCache.get(PAGE_KEY);
			expect([oldRead?.lastModified, newRead?.lastModified]).toEqual([1000, 2000]);
			if (newFirst) {
				await report(newRead, FRESH);
				await report(oldRead, REVALIDATED);
			} else {
				await report(oldRead, REVALIDATED);
				await report(newRead, FRESH);
			}
			await flushWaitUntil();

			expect(fakeCache.put).toHaveBeenCalledTimes(1);
			expect(JSON.parse(fakeCache.entries.get(PAGE_URL)!).lastModified).toBe(2000);
		});

		it("does not store a revalidated miss when an overlapping hit is a different entry", async () => {
			const regionalCache = createRegionalCache();

			// The miss reads an old entry from the store.
			const miss = await regionalCache.get(PAGE_KEY);
			// i.e. another request regenerates the entry between the two reads.
			fakeCache.entries.set(PAGE_URL, JSON.stringify(createStoreEntry(2000)));
			const hit = await regionalCache.get(PAGE_KEY);
			expect([hit?.lastModified, hit?.shouldBypassTagCache, hit?.onTagCacheResult]).toEqual([
				2000,
				true,
				undefined,
			]);
			await report(miss, REVALIDATED);
			await flushWaitUntil();

			expect(fakeCache.put).not.toHaveBeenCalled();
			expect(JSON.parse(fakeCache.entries.get(PAGE_URL)!).lastModified).toBe(2000);
		});

		it("updates and evicts overlapping lazy hits of different entries according to their own verdict", async () => {
			const regionalCache = createRegionalCache({
				shouldLazilyUpdateOnCacheHit: true,
				bypassTagCacheOnCacheHit: false,
			});
			fakeCache.entries.set(PAGE_URL, JSON.stringify(createStoreEntry(1000)));

			const oldHit = await regionalCache.get(PAGE_KEY);
			// i.e. the regional entry is updated between the two reads.
			fakeCache.entries.set(PAGE_URL, JSON.stringify(createStoreEntry(2000)));
			const newHit = await regionalCache.get(PAGE_KEY);
			expect([oldHit?.lastModified, newHit?.lastModified]).toEqual([1000, 2000]);

			await report(newHit, FRESH);
			await flushWaitUntil();
			expect(store.get).toHaveBeenCalledTimes(1);
			expect(fakeCache.delete).not.toHaveBeenCalled();

			await report(oldHit, REVALIDATED);
			expect(fakeCache.delete).toHaveBeenCalledWith(PAGE_URL);
			expect(store.get).toHaveBeenCalledTimes(1);
		});
	});
});
