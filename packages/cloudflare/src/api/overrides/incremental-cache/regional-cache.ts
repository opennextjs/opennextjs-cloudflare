import { error } from "@opennextjs/aws/adapters/logger.js";
import {
	CacheEntryType,
	CacheValue,
	IncrementalCache,
	TagCacheResult,
	WithLastModified,
} from "@opennextjs/aws/types/overrides.js";
import { compareSemver } from "@opennextjs/aws/utils/semver.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, IncrementalCacheEntry, isPurgeCacheEnabled } from "../internal.js";

const ONE_MINUTE_IN_SECONDS = 60;
const THIRTY_MINUTES_IN_SECONDS = ONE_MINUTE_IN_SECONDS * 30;

type Options = {
	/**
	 * The mode to use for the regional cache.
	 *
	 * - `short-lived`: Re-use a cache entry for up to a minute after it has been retrieved.
	 * - `long-lived`: Re-use a fetch cache entry until it is revalidated (per-region),
	 *                 or an ISR/SSG entry for up to 30 minutes.
	 */
	mode: "short-lived" | "long-lived";

	/**
	 * The default TTL of long-lived cache entries.
	 * When no revalidate is provided, the default age will be used.
	 *
	 * @default `THIRTY_MINUTES_IN_SECONDS`
	 */
	defaultLongLivedTtlSec?: number;

	/**
	 * Whether the regional cache entry should be updated in the background on regional cache hits.
	 * The entry is only updated when OpenNext reports it as neither revalidated nor stale, otherwise it is evicted.
	 *
	 * NOTE: Use the default value unless you know what you are doing. It is set to:
	 * - Next < 16:
	 *   `true` in `long-lived` mode when cache purge is not used, `false` otherwise.
	 * - Next >= 16:
	 *   `!bypassTagCacheOnCacheHit`
	 */
	shouldLazilyUpdateOnCacheHit?: boolean;

	/**
	 * Whether the tagCache should be skipped on regional cache hits.
	 *
	 * Note:
	 * - Skipping the tagCache allows requests to be handled faster
	 * - When `true`, make sure the cache gets purged
	 *   either by enabling the auto cache purging feature or manually
	 *
	 * `true` is not compatible with SWR types of revalidateTag
	 * i.e. on Next 16+, anything different than `revalidateTag("tag", { expire: 0 })`.
	 * That's why the default is `false` for Next 16+ which uses SWR by default.
	 *
	 * NOTE: Use the default value unless you know what you are doing. It is set to:
	 * - Next <16:
	 *    `true` if the auto cache purging is enabled, `false` otherwise.
	 * - Next >= 16:
	 *   `false`
	 */
	bypassTagCacheOnCacheHit?: boolean;
};

interface PutToCacheInput {
	key: string;
	cacheType?: CacheEntryType;
	entry: IncrementalCacheEntry<CacheEntryType>;
}

// `lastModified` is the one of the entry that was read.
// `overlapping` is set when reads of different entries of the key overlapped in the request (see `addPendingEntry`).
type PendingCacheEntry =
	// Cache miss: the entry read from the store, ready to be stored in the regional cache.
	// `response` is `undefined` when the entry can not be stored in the Cache API.
	| { type: "put"; urlKey: string; lastModified?: number; response?: Response; overlapping?: boolean }
	// Cache hit with shouldLazilyUpdateOnCacheHit: needs a fresh fetch from the store before storing,
	// or is evicted when it has been revalidated or is stale.
	| {
			type: "lazy-update";
			urlKey: string;
			lastModified?: number;
			cacheType?: CacheEntryType;
			overlapping?: boolean;
	  };

/**
 * Returns the pending regional cache entries of the current request.
 *
 * Entries are keyed by `key` only (not `key` + `cacheType`): the key formats of the different cache types
 * do not collide in practice.
 *
 * @returns The pending entries, or `undefined` outside of a request (i.e. no OpenNext ALS store).
 */
function getPendingEntries(): Map<string, PendingCacheEntry> | undefined {
	return globalThis.__openNextAls
		?.getStore()
		?.requestCache.getOrCreate<string, PendingCacheEntry>("regional-cache:pending");
}

/**
 * Records the pending entry of a `get` in the current request.
 *
 * `onTagCacheResult` only gets the key, so its verdict can not be matched with one of several pending reads of the
 * key. That is fine when they read the same entry (same `lastModified`): the verdict depends on the entry only.
 * When they read different entries, the entry is flagged as `overlapping`: the regional cache is then not populated
 * for the key for the rest of the request.
 *
 * Nothing is recorded outside of a request (i.e. no OpenNext ALS store).
 *
 * @param key The cache key.
 * @param entry The pending entry.
 */
function addPendingEntry(key: string, entry: PendingCacheEntry): void {
	const pending = getPendingEntries();
	if (!pending) return;
	const prev = pending.get(key);
	const overlapping = prev !== undefined && (prev.overlapping || prev.lastModified !== entry.lastModified);
	pending.set(key, overlapping ? { ...entry, overlapping } : entry);
}

/**
 * Wrapper adding a regional cache on an `IncrementalCache` implementation.
 *
 * Using a the `RegionalCache` does not directly improves the performance much.
 * However it allows bypassing the tag cache (see `bypassTagCacheOnCacheHit`) on hits.
 * That's where bigger perf gain happens.
 *
 * We recommend using cache purge.
 * When cache purge is not enabled, there is a possibility that the Cache API (local to a Data Center)
 * is out of sync with the cache store (i.e. R2). That's why when cache purge is not enabled the Cache
 * API is refreshed from the cache store on cache hits (for the long-lived mode).
 *
 * Entries read from the store are only stored in the Cache API once OpenNext reports (via `onTagCacheResult`)
 * that they have not been revalidated and are not stale:
 * - Entries that are stale because of time are only skipped when `enableCacheInterception` is on, because that
 *   is the only code path that reports `isStaleFromTime`. Otherwise they are stored as before.
 * - Nothing is stored outside of a request context (no OpenNext ALS store).
 */
class RegionalCache implements IncrementalCache {
	public name: string;

	protected localCache: Cache | undefined;

	constructor(
		private store: IncrementalCache,
		private opts: Options
	) {
		this.name = this.store.name;

		// `globalThis.nextVersion` is only defined at runtime but not when the Open Next build runs.
		// The options do no matter at build time so we can skip setting them.
		const { nextVersion } = globalThis;
		if (nextVersion) {
			if (compareSemver(nextVersion, "<", "16")) {
				// Next < 16
				this.opts.shouldLazilyUpdateOnCacheHit ??= this.opts.mode === "long-lived" && !isPurgeCacheEnabled();
				this.opts.bypassTagCacheOnCacheHit ??= isPurgeCacheEnabled();
			} else {
				// Next >= 16
				this.opts.bypassTagCacheOnCacheHit ??= false;
				if (this.opts.bypassTagCacheOnCacheHit) {
					debugCache(
						"RegionalCache",
						`bypassTagCacheOnCacheHit is not recommended for Next 16+ as it is not compatible with SWR tags. Make sure to always use \`revalidateTag\` with \`{ expire: 0 }\` if you want to bypass the tag cache.`
					);
				}
				this.opts.shouldLazilyUpdateOnCacheHit ??= !this.opts.bypassTagCacheOnCacheHit;
				if (this.opts.shouldLazilyUpdateOnCacheHit !== this.opts.bypassTagCacheOnCacheHit) {
					debugCache(
						"RegionalCache",
						`\`shouldLazilyUpdateOnCacheHit\` and \`bypassTagCacheOnCacheHit\` are mutually exclusive for Next 16+.`
					);
				}
			}
		}
	}

	/**
	 * Reads a cache entry from the Cache API, or from the store on a miss.
	 *
	 * Keys without a Cache API URL (see `getCacheUrlKey`) are only read from the store.
	 *
	 * @param key The cache key.
	 * @param cacheType The type of the cache entry.
	 * @returns The cache entry, or `null` when it does not exist or the read fails.
	 */
	async get<CacheType extends CacheEntryType = "cache">(
		key: string,
		cacheType?: CacheType
	): Promise<WithLastModified<CacheValue<CacheType>> | null> {
		try {
			const cache = await this.getCacheInstance();
			const urlKey = this.getCacheUrlKey(key, cacheType);

			// Check for a cached entry as this will be faster than the store response.
			// Keys without a Cache API URL are only read from the store.
			const cachedResponse = urlKey === null ? undefined : await cache.match(urlKey);

			if (urlKey !== null && cachedResponse) {
				debugCache("RegionalCache", `get ${key} -> cached response`);

				const responseJson: Record<string, unknown> & { lastModified?: number } = await cachedResponse.json();

				// Defer the lazy update so onTagCacheResult() can decide whether it should happen.
				// If the entry turns out to be stale or revalidated we must not refresh the regional
				// cache with outdated data.
				// Note: this is only useful when the Cache API is not purged automatically.
				if (this.opts.shouldLazilyUpdateOnCacheHit) {
					addPendingEntry(key, {
						type: "lazy-update",
						urlKey,
						lastModified: responseJson.lastModified,
						cacheType,
					});
				}

				return {
					...responseJson,
					shouldBypassTagCache: this.opts.bypassTagCacheOnCacheHit,
				};
			}

			const rawEntry = await this.store.get(key, cacheType);
			const { value, lastModified } = rawEntry ?? {};
			if (!value || typeof lastModified !== "number") return null;

			debugCache("RegionalCache", `get ${key} -> deferred put to cache`);

			// Defer storing into the regional cache until onTagCacheResult() confirms the entry
			// is neither stale nor revalidated. Storing immediately could propagate stale data.
			// The entry is snapshotted now as the returned value is shared with OpenNext and Next.js.
			if (urlKey !== null) {
				let response: Response | undefined;
				try {
					response = this.createCacheResponse(key, { value, lastModified });
				} catch (e) {
					// i.e. a tag that is not a valid header value. The entry is still returned.
					error(`Failed to prepare the regional cache entry for ${key}`, e);
				}
				addPendingEntry(key, { type: "put", urlKey, lastModified, response });
			}

			return { value, lastModified };
		} catch (e) {
			error("Failed to get from regional cache", e);
			return null;
		}
	}

	async set<CacheType extends CacheEntryType = "cache">(
		key: string,
		value: CacheValue<CacheType>,
		cacheType?: CacheType
	): Promise<void> {
		try {
			debugCache("RegionalCache", `set ${key}`);

			await this.store.set(key, value, cacheType);

			await this.putToCache({
				key,
				cacheType,
				entry: {
					value,
					// Note: `Date.now()` returns the time of the last IO rather than the actual time.
					//       See https://developers.cloudflare.com/workers/reference/security-model/
					lastModified: Date.now(),
				},
			});
		} catch (e) {
			error(`Failed to set the regional cache`, e);
		}
	}

	/**
	 * Deletes a cache entry from the store and from the Cache API.
	 *
	 * @param key The cache key.
	 */
	async delete(key: string): Promise<void> {
		debugCache("RegionalCache", `delete ${key}`);
		try {
			await this.store.delete(key);

			const urlKey = this.getCacheUrlKey(key);
			if (urlKey !== null) {
				const cache = await this.getCacheInstance();
				await cache.delete(urlKey);
			}
		} catch (e) {
			error("Failed to delete from regional cache", e);
		}
	}

	/**
	 * Stores the pending entry of `get` in the Cache API when it has not been revalidated and is not stale.
	 *
	 * Called by OpenNext after the tag cache has been checked for an entry returned by `get`.
	 * A regional cache hit that has been revalidated or is stale is evicted from the Cache API when
	 * `shouldLazilyUpdateOnCacheHit` is on, so that the next request reads the store.
	 * Pending entries are consumed, so calling it again or for a key without a pending entry is a no-op.
	 * Nothing is stored for a key with overlapping reads of different entries in the request (see `addPendingEntry`).
	 *
	 * @param result The tag cache result for the entry.
	 */
	async onTagCacheResult(result: TagCacheResult): Promise<void> {
		const { key, hasBeenRevalidated, isStaleFromTag, isStaleFromTime } = result;

		const pending = getPendingEntries();
		const entry = pending?.get(key);
		if (!pending || !entry) return;

		// Consume the entry: only one storage decision per get() call.
		// Overlapping entries are kept so that the later reads of the key in the request are flagged too.
		if (!entry.overlapping) {
			pending.delete(key);
		}

		const cache = await this.getCacheInstance();

		// Revalidated or stale entries are not stored: they would be served from the regional cache
		// (possibly without checking the tag cache) until they expire.
		// `isStaleFromTime` is only reported by the cache interceptor, `undefined` (unknown) entries are stored.
		if (hasBeenRevalidated || isStaleFromTag || isStaleFromTime) {
			debugCache(
				"RegionalCache",
				`onTagCacheResult ${key} -> skip (revalidated: ${hasBeenRevalidated}, stale from tag: ${isStaleFromTag}, stale from time: ${isStaleFromTime})`
			);
			// A rejected regional hit is evicted: the store may hold a newer entry (i.e. regenerated in another
			// region) that would otherwise not be read until the regional entry expires.
			// Awaited so that it can not delete an entry written by `set()` later in the request.
			if (entry.type === "lazy-update") {
				await cache.delete(entry.urlKey);
			}
			return;
		}

		// The verdict may be about another entry of the key.
		if (entry.overlapping) {
			debugCache("RegionalCache", `onTagCacheResult ${key} -> skip (overlapping reads)`);
			return;
		}

		debugCache("RegionalCache", `onTagCacheResult ${key} -> ${entry.type}`);

		const { ctx } = getCloudflareContext();

		if (entry.type === "put") {
			if (entry.response) {
				ctx.waitUntil(cache.put(entry.urlKey, entry.response));
			}
		} else {
			// lazy-update: re-fetch the entry from the store, then refresh the regional cache.
			ctx.waitUntil(
				this.store.get(key, entry.cacheType).then(async (rawEntry) => {
					const { value, lastModified } = rawEntry ?? {};
					if (value && typeof lastModified === "number") {
						await this.putToCache({ key, cacheType: entry.cacheType, entry: { value, lastModified } });
					}
				})
			);
		}
	}

	protected async getCacheInstance(): Promise<Cache> {
		if (this.localCache) return this.localCache;

		this.localCache = await caches.open("incremental-cache");
		return this.localCache;
	}

	/**
	 * Returns the Cache API URL of the entry for `key`.
	 *
	 * The key is opaque and may contain characters that are meaningful in a URL (`%`, `\`, `?`, `#`, ...).
	 * Each segment is encoded so that the URL parser can not resolve the key to the URL of a different entry
	 * (i.e. `x/%2e%2e/admin` or `x\..\admin` to `admin`).
	 *
	 * @param key The cache key.
	 * @param cacheType The type of the cache entry.
	 * @returns The Cache API URL, or `null` when the key contains a `.` or `..` segment that the URL parser would resolve.
	 */
	protected getCacheUrlKey(key: string, cacheType?: CacheEntryType): string | null {
		const buildId = process.env.OPEN_NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
		const segments = `/${buildId}/${key}.${cacheType ?? "cache"}`.replace(/\/+/g, "/").split("/");
		if (segments.some((segment) => segment === "." || segment === "..")) {
			return null;
		}
		return `http://cache.local${segments.map(encodeURIComponent).join("/")}`;
	}

	/**
	 * Stores an entry in the Cache API.
	 *
	 * Nothing is stored when the key has no Cache API URL (see `getCacheUrlKey`).
	 *
	 * @param input The key, type and entry to store.
	 */
	protected async putToCache({ key, cacheType, entry }: PutToCacheInput): Promise<void> {
		const urlKey = this.getCacheUrlKey(key, cacheType);
		if (urlKey === null) {
			debugCache("RegionalCache", `invalid key ${key}`);
			return;
		}
		const cache = await this.getCacheInstance();
		await cache.put(urlKey, this.createCacheResponse(key, entry));
	}

	/**
	 * Returns the Cache API response for an entry.
	 *
	 * The entry is serialized synchronously so that later changes to the value do not affect what is stored.
	 *
	 * @param key The cache key, used as the tag when the entry has none.
	 * @param entry The entry to store.
	 * @returns The response to store in the Cache API.
	 */
	protected createCacheResponse(key: string, entry: IncrementalCacheEntry<CacheEntryType>): Response {
		const age =
			this.opts.mode === "short-lived"
				? ONE_MINUTE_IN_SECONDS
				: entry.value.revalidate || this.opts.defaultLongLivedTtlSec || THIRTY_MINUTES_IN_SECONDS;

		// We default to the entry key if no tags are found.
		// so that we can also revalidate page router based entry this way.
		const tags = getTagsFromCacheEntry(entry) ?? [key];

		return new Response(JSON.stringify(entry), {
			headers: new Headers({
				"cache-control": `max-age=${age}`,
				...(tags.length > 0
					? {
							"cache-tag": tags.join(","),
						}
					: {}),
			}),
		});
	}
}

/**
 * A regional cache will wrap an incremental cache and provide faster cache lookups for an entry
 * when making requests within the region.
 *
 * The regional cache uses the Cache API.
 *
 * **WARNING:**
 * If an entry is revalidated on demand in one region (using either `revalidateTag`, `revalidatePath` or `res.revalidate` ), it will trigger an additional revalidation if
 * a request is made to another region that has an entry stored in its regional cache.
 *
 * @param cache Incremental cache instance.
 * @param opts Options for the regional cache.
 */
export function withRegionalCache(cache: IncrementalCache, opts: Options) {
	return new RegionalCache(cache, opts);
}

/**
 * Extract the list of tags from a cache entry.
 */
function getTagsFromCacheEntry(entry: IncrementalCacheEntry<CacheEntryType>): string[] | undefined {
	if ("tags" in entry.value && entry.value.tags) {
		return entry.value.tags;
	}

	if (
		"meta" in entry.value &&
		entry.value.meta &&
		"headers" in entry.value.meta &&
		entry.value.meta.headers
	) {
		const rawTags = entry.value.meta.headers["x-next-cache-tags"];
		if (typeof rawTags === "string") {
			return rawTags.split(",");
		}
	}
	if ("value" in entry.value) {
		return entry.value.tags;
	}
}
