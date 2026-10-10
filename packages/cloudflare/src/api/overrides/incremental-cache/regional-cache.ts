import { error } from "@opennextjs/aws/adapters/logger.js";
import {
	CacheEntryType,
	CacheValue,
	IncrementalCache,
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

/**
 * Everything written to the Cache API for an entry, computed synchronously from the entry.
 */
interface PreparedCacheEntry {
	urlKey: string;
	body: string;
	headers: Record<string, string>;
	/** Tags of the entry as found in the value, used to check the tag cache. */
	tags: string[];
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

	async get<CacheType extends CacheEntryType = "cache">(
		key: string,
		cacheType?: CacheType
	): Promise<WithLastModified<CacheValue<CacheType>> | null> {
		try {
			const cache = await this.getCacheInstance();
			const urlKey = this.getCacheUrlKey(key, cacheType);

			// Check for a cached entry as this will be faster than the store response.
			const cachedResponse = await cache.match(urlKey);

			if (cachedResponse) {
				debugCache("RegionalCache", `get ${key} -> cached response`);

				// Re-fetch from the store and update the regional cache in the background.
				// Note: this is only useful when the Cache API is not purged automatically.
				if (this.opts.shouldLazilyUpdateOnCacheHit) {
					getCloudflareContext().ctx.waitUntil(
						this.store.get(key, cacheType).then(async (rawEntry) => {
							const { value, lastModified } = rawEntry ?? {};

							if (value && typeof lastModified === "number") {
								await this.refillFromStore({ key, cacheType, entry: { value, lastModified } });
							}
						})
					);
				}

				const responseJson: Record<string, unknown> = await cachedResponse.json();

				return {
					...responseJson,
					shouldBypassTagCache: this.opts.bypassTagCacheOnCacheHit,
				};
			}

			const rawEntry = await this.store.get(key, cacheType);
			const { value, lastModified } = rawEntry ?? {};
			if (!value || typeof lastModified !== "number") return null;

			debugCache("RegionalCache", `get ${key} -> put to cache`);

			// Update the local cache after retrieving from the store.
			// Note: `refillFromStore` snapshots the entry synchronously, before the caller gets the value back.
			//       That matters because `@opennextjs/aws` deletes the `x-next-cache-tags` header from the value.
			getCloudflareContext().ctx.waitUntil(
				this.refillFromStore({ key, cacheType, entry: { value, lastModified } })
			);

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

	async delete(key: string): Promise<void> {
		debugCache("RegionalCache", `delete ${key}`);
		try {
			await this.store.delete(key);

			const cache = await this.getCacheInstance();
			await cache.delete(this.getCacheUrlKey(key));
		} catch (e) {
			error("Failed to delete from regional cache", e);
		}
	}

	protected async getCacheInstance(): Promise<Cache> {
		if (this.localCache) return this.localCache;

		this.localCache = await caches.open("incremental-cache");
		return this.localCache;
	}

	protected getCacheUrlKey(key: string, cacheType?: CacheEntryType) {
		const buildId = process.env.OPEN_NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
		return "http://cache.local" + `/${buildId}/${key}`.replace(/\/+/g, "/") + `.${cacheType ?? "cache"}`;
	}

	/**
	 * Computes what is written to the Cache API for an entry.
	 *
	 * This must run synchronously when the entry is received:
	 * `getTagsFromValue` from `@opennextjs/aws` deletes the `x-next-cache-tags` header from the (shared) value.
	 * Reading the tags after an `await` could store an entry without tags, that would never be purged.
	 */
	protected prepareCacheEntry({ key, cacheType, entry }: PutToCacheInput): PreparedCacheEntry {
		const urlKey = this.getCacheUrlKey(key, cacheType);

		const age =
			this.opts.mode === "short-lived"
				? ONE_MINUTE_IN_SECONDS
				: entry.value.revalidate || this.opts.defaultLongLivedTtlSec || THIRTY_MINUTES_IN_SECONDS;

		const entryTags = getTagsFromCacheEntry(entry);
		// We default to the entry key if no tags are found.
		// so that we can also revalidate page router based entry this way.
		const cacheTags = entryTags ?? [key];

		return {
			urlKey,
			body: JSON.stringify(entry),
			headers: {
				"cache-control": `max-age=${age}`,
				...(cacheTags.length > 0 ? { "cache-tag": cacheTags.join(",") } : {}),
			},
			tags: [...(entryTags ?? [])],
		};
	}

	protected async putToCache(input: PutToCacheInput): Promise<void> {
		// Snapshot the entry before any `await` (see `prepareCacheEntry`).
		const prepared = this.prepareCacheEntry(input);
		await this.writeToCache(prepared);
	}

	/**
	 * Seeds the regional cache with an entry read from the store.
	 *
	 * When the tag cache is bypassed on cache hits, the entry is only stored when the tag cache reports it as
	 * neither revalidated nor stale. Otherwise a revalidated entry would be served (as fresh) from the
	 * regional cache without ever consulting the tag cache, until it expires or is purged again.
	 */
	protected async refillFromStore(input: PutToCacheInput): Promise<void> {
		// Snapshot the entry before any `await` (see `prepareCacheEntry`).
		const prepared = this.prepareCacheEntry(input);

		try {
			if (
				this.opts.bypassTagCacheOnCacheHit &&
				(await isRevalidatedInTagCache(input.key, prepared.tags, input.entry.lastModified))
			) {
				debugCache(
					"RegionalCache",
					`${input.key} has been revalidated, not storing it in the regional cache`
				);
				return;
			}

			await this.writeToCache(prepared);
		} catch (e) {
			error("Failed to refill the regional cache", e);
		}
	}

	protected async writeToCache({ urlKey, body, headers }: PreparedCacheEntry): Promise<void> {
		const cache = await this.getCacheInstance();
		await cache.put(urlKey, new Response(body, { headers: new Headers(headers) }));
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
 * Whether the tag cache reports an entry as revalidated or stale.
 *
 * This mirrors the checks `@opennextjs/aws` performs on entries that do not bypass the tag cache.
 * They are not imported from `@opennextjs/aws/utils/cache.js` which can not be loaded outside of a bundle.
 *
 * @param key The key of the entry
 * @param tags The tags of the entry
 * @param lastModified The last modified time of the entry
 */
async function isRevalidatedInTagCache(key: string, tags: string[], lastModified: number): Promise<boolean> {
	if (globalThis.openNextConfig?.dangerous?.disableTagCache) {
		return false;
	}

	const { tagCache } = globalThis;
	// SWR for `revalidateTag` (stale but not expired entries) is only supported from Next 16.
	const supportsStale = Boolean(globalThis.nextVersion) && compareSemver(globalThis.nextVersion, ">=", "16");

	if (tagCache.mode === "nextMode") {
		if (tags.length === 0) {
			return false;
		}
		if (await tagCache.hasBeenRevalidated(tags, lastModified)) {
			return true;
		}
		return supportsStale && ((await tagCache.isStale?.(tags, lastModified)) ?? false);
	}

	if ((await tagCache.getLastModified(key, lastModified)) === -1) {
		return true;
	}
	return supportsStale && ((await tagCache.isStale?.(key, lastModified)) ?? false);
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
