/**
 * Tests of the regional cache with the OpenNext cache adapters that report the tag cache verdicts.
 */
import Cache from "@opennextjs/aws/adapters/cache.js";
import ComposableCache from "@opennextjs/aws/adapters/composable-cache.js";
import { cacheInterceptor } from "@opennextjs/aws/core/routing/cacheInterceptor.js";
import type { MiddlewareEvent } from "@opennextjs/aws/types/open-next.js";
import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { getComposableCacheStorageKey } from "@opennextjs/aws/utils/cache.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { withRegionalCache } from "./regional-cache.js";

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
	NextConfig: {},
	RoutesManifest: { basePath: "", locales: [], routes: { static: [], dynamic: [] } },
	AppPathRoutesManifest: {},
	AppPathsManifest: { "/isr/page": "app/isr/page.js" },
	PagesManifest: {},
	PrerenderManifest: {
		routes: { "/isr": { initialRevalidateSeconds: 60, srcRoute: "/isr", dataRoute: "/isr.rsc" } },
		dynamicRoutes: {},
	},
}));

vi.mock("@opennextjs/aws/core/routing/i18n/index.js", () => ({
	localizePath: (event: MiddlewareEvent) => event.rawPath,
	localizePathname: (_event: MiddlewareEvent, pathname: string) => pathname,
}));

const BUILD_ID = "build-id";
const FETCH_KEY = "fetch-key";
const FETCH_URL = `http://cache.local/${BUILD_ID}/${FETCH_KEY}.fetch`;
const PAGE_KEY = "/isr";
const PAGE_URL = `http://cache.local/${BUILD_ID}/isr.cache`;

type StoreEntry = { value: unknown; lastModified: number };

/**
 * Returns a fetch cache entry as stored by Next.js.
 *
 * @param body The body of the cached fetch response.
 * @param lastModified The version of the entry.
 * @returns The store entry.
 */
function createFetchEntry(body: string, lastModified: number): StoreEntry {
	return {
		value: {
			kind: "FETCH",
			data: { headers: {}, body, url: "https://example.com", status: 200 },
			revalidate: 60,
			tags: ["my-tag"],
		},
		lastModified,
	};
}

/**
 * Returns an app router page entry.
 *
 * @param lastModified The version of the entry.
 * @returns The store entry.
 */
function createPageEntry(lastModified: number): StoreEntry {
	return {
		value: {
			type: "app",
			html: "<html></html>",
			rsc: "rsc",
			meta: { status: 200, headers: { "x-next-cache-tags": "my-tag" } },
			revalidate: 60,
		},
		lastModified,
	};
}

describe("RegionalCache with the OpenNext cache adapters", () => {
	let entries: Map<string, string>;
	let fakeCache: {
		match: ReturnType<typeof vi.fn>;
		put: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
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
		getByPath: ReturnType<typeof vi.fn>;
		getByTag: ReturnType<typeof vi.fn>;
		getLastModified: ReturnType<typeof vi.fn>;
		writeTags: ReturnType<typeof vi.fn>;
	};
	let background: Promise<unknown>[];

	/**
	 * Creates the regional cache and installs it as the OpenNext incremental cache.
	 *
	 * @param opts Options overriding the defaults of the tests.
	 * @returns The regional cache.
	 */
	function installRegionalCache(opts: Partial<Parameters<typeof withRegionalCache>[1]> = {}) {
		const regionalCache = withRegionalCache(store as unknown as IncrementalCache, {
			mode: "long-lived",
			shouldLazilyUpdateOnCacheHit: false,
			bypassTagCacheOnCacheHit: true,
			...opts,
		});
		globalThis.incrementalCache = regionalCache;
		return regionalCache;
	}

	/**
	 * Waits for all the promises passed to `waitUntil`.
	 */
	async function flushBackground(): Promise<void> {
		while (background.length > 0) {
			await Promise.all(background.splice(0));
		}
	}

	/**
	 * Sets up the OpenNext ALS store of a new request.
	 */
	function startRequest(): void {
		const requestStore = {};
		vi.stubGlobal("__openNextAls", { getStore: () => requestStore });
	}

	/**
	 * Returns the version of the entry stored in the Cache API.
	 *
	 * @param url The Cache API URL.
	 * @returns The `lastModified` of the entry, or `undefined` when there is no entry.
	 */
	function storedVersion(url: string): number | undefined {
		const body = entries.get(url);
		return body === undefined ? undefined : JSON.parse(body).lastModified;
	}

	beforeEach(() => {
		vi.stubEnv("OPEN_NEXT_BUILD_ID", BUILD_ID);
		entries = new Map();
		fakeCache = {
			match: vi.fn(async (url: string) => {
				const body = entries.get(url);
				return body === undefined ? undefined : new Response(body);
			}),
			put: vi.fn(async (url: string, response: Response) => {
				entries.set(url, await response.text());
			}),
			delete: vi.fn(async (url: string) => entries.delete(url)),
		};
		vi.stubGlobal("caches", { open: async () => fakeCache });
		background = [];
		vi.mocked(getCloudflareContext).mockReturnValue({
			ctx: { waitUntil: (promise: Promise<unknown>) => background.push(promise) },
		} as unknown as ReturnType<typeof getCloudflareContext>);
		store = {
			name: "store",
			get: vi.fn(async () => null),
			set: vi.fn(async () => {}),
			delete: vi.fn(async () => {}),
		};
		tagCache = {
			mode: "nextMode",
			name: "tag-cache",
			hasBeenRevalidated: vi.fn(async () => false),
			isStale: vi.fn(async () => false),
			getByPath: vi.fn(async () => []),
			getByTag: vi.fn(async () => []),
			getLastModified: vi.fn(async () => Date.now()),
			writeTags: vi.fn(async () => {}),
		};
		vi.stubGlobal("tagCache", tagCache);
		vi.stubGlobal("openNextConfig", { dangerous: {} });
		vi.stubGlobal("nextVersion", "16.0.0");
		vi.stubGlobal("queue", { name: "queue", send: vi.fn(async () => {}) });
		vi.stubGlobal("incrementalCache", undefined);
		startRequest();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	describe("fetch cache", () => {
		it("stores a fresh entry, the next request bypasses the tag cache", async () => {
			installRegionalCache();
			store.get.mockResolvedValue(createFetchEntry("data", 1000));

			expect((await new Cache().getFetchCache(FETCH_KEY, [], ["my-tag"]))?.lastModified).toBe(1000);
			await flushBackground();
			expect(storedVersion(FETCH_URL)).toBe(1000);

			startRequest();
			tagCache.hasBeenRevalidated.mockClear();
			expect((await new Cache().getFetchCache(FETCH_KEY, [], ["my-tag"]))?.lastModified).toBe(1000);
			expect(store.get).toHaveBeenCalledTimes(1);
			expect(tagCache.hasBeenRevalidated).not.toHaveBeenCalled();
		});

		// Regression test for https://github.com/opennextjs/opennextjs-cloudflare/issues/1295
		it("does not store a revalidated entry", async () => {
			installRegionalCache();
			store.get.mockResolvedValue(createFetchEntry("data", 1000));
			tagCache.hasBeenRevalidated.mockResolvedValue(true);

			expect(await new Cache().getFetchCache(FETCH_KEY, [], ["my-tag"])).toBeNull();
			await flushBackground();

			expect(entries.size).toBe(0);
		});

		it.each(["hasBeenRevalidated", "isStale"] as const)(
			"leaves the region empty if %s throws, so the next read retries validation",
			async (check) => {
				installRegionalCache();
				store.get.mockResolvedValue(createFetchEntry("data", 1000));
				tagCache[check].mockRejectedValueOnce(new Error("tag store unavailable"));
				const read = () => new Cache().getFetchCache(FETCH_KEY, [], ["my-tag"]);

				expect(await read()).toBeNull();
				await flushBackground();
				expect(fakeCache.put).not.toHaveBeenCalled();

				startRequest();
				expect((await read())?.lastModified).toBe(1000);
				await flushBackground();
				expect(store.get).toHaveBeenCalledTimes(2);
				expect(tagCache[check]).toHaveBeenCalledTimes(2);
				expect(storedVersion(FETCH_URL)).toBe(1000);
			}
		);

		it("finishes evicting a revalidated lazy hit before the adapter returns a miss", async () => {
			installRegionalCache({ shouldLazilyUpdateOnCacheHit: true, bypassTagCacheOnCacheHit: false });
			entries.set(FETCH_URL, JSON.stringify(createFetchEntry("data", 1000)));
			tagCache.hasBeenRevalidated.mockResolvedValue(true);
			fakeCache.delete.mockImplementationOnce(async (url: string) => {
				await new Promise<void>((resolve) => setImmediate(resolve));
				return entries.delete(url);
			});

			expect(await new Cache().getFetchCache(FETCH_KEY, [], ["my-tag"])).toBeNull();
			// Next can regenerate immediately, without draining any waitUntil work.
			expect(entries.has(FETCH_URL)).toBe(false);
			expect(store.get).not.toHaveBeenCalled();
		});
	});

	describe("incremental (ISR) cache", () => {
		it.each([
			{ verdict: "fresh", revalidated: false, stale: false, stored: true },
			{ verdict: "revalidated", revalidated: true, stale: false, stored: false },
			{ verdict: "stale from a tag", revalidated: false, stale: true, stored: false },
		])("stores a $verdict entry: $stored", async ({ revalidated, stale, stored }) => {
			installRegionalCache();
			store.get.mockResolvedValue(createPageEntry(1000));
			tagCache.hasBeenRevalidated.mockResolvedValue(revalidated);
			tagCache.isStale.mockResolvedValue(stale);

			await new Cache().getIncrementalCache(PAGE_KEY);
			await flushBackground();

			expect(storedVersion(PAGE_URL)).toBe(stored ? 1000 : undefined);
		});
	});

	describe("composable cache", () => {
		it.each([
			{ verdict: "fresh", revalidated: false, stored: true },
			{ verdict: "revalidated", revalidated: true, stored: false },
		])("stores a $verdict entry: $stored", async ({ revalidated, stored }) => {
			installRegionalCache();
			const storageKey = getComposableCacheStorageKey("composable-key");
			store.get.mockResolvedValue({
				value: { value: "data", tags: ["my-tag"], stale: 0, timestamp: 1000, expire: 600, revalidate: 60 },
				lastModified: 1000,
			});
			tagCache.hasBeenRevalidated.mockResolvedValue(revalidated);

			const result = await ComposableCache.get("composable-key");
			expect(result === undefined).toBe(revalidated);
			await flushBackground();

			expect(store.get).toHaveBeenCalledWith(storageKey, "composable");
			expect(storedVersion(`http://cache.local/${BUILD_ID}/${storageKey}.composable`)).toBe(
				stored ? 1000 : undefined
			);
		});
	});

	describe("cache interceptor", () => {
		/**
		 * Returns a GET request for a path.
		 *
		 * @param path The path of the request.
		 * @returns The event.
		 */
		function createEvent(path: string): MiddlewareEvent {
			return {
				type: "core",
				method: "GET",
				rawPath: path,
				url: `https://example.com${path}`,
				body: Buffer.from(""),
				headers: { host: "example.com" },
				query: {},
				cookies: {},
				remoteAddress: "::1",
			};
		}

		it.each([
			{ verdict: "fresh", age: 0, stored: true },
			{ verdict: "stale from time", age: 120_000, stored: false },
		])("stores a $verdict entry: $stored", async ({ age, stored }) => {
			installRegionalCache();
			const lastModified = Date.now() - age;
			store.get.mockResolvedValue(createPageEntry(lastModified));

			const result = await cacheInterceptor(createEvent(PAGE_KEY));
			expect(result.type).toBe("core");
			expect("statusCode" in result && result.statusCode).toBe(200);
			await flushBackground();

			expect(storedVersion(PAGE_URL)).toBe(stored ? lastModified : undefined);
		});
	});
});
