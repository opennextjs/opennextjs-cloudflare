import { error } from "@opennextjs/aws/adapters/logger.js";
import {
  CacheEntryType,
  CacheValue,
  IncrementalCache,
  WithLastModified,
} from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, IncrementalCacheEntry } from "../internal.js";
import { NAME as KV_CACHE_NAME } from "./kv-incremental-cache.js";

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
   * Whether the regional cache entry should be updated in the background or not when it experiences
   * a cache hit.
   *
   * @default `false` for the `short-lived` mode, and `true` for the `long-lived` mode.
   */
  shouldLazilyUpdateOnCacheHit?: boolean;
};

interface PutToCacheInput {
  key: string;
  cacheType?: CacheEntryType;
  entry: IncrementalCacheEntry<CacheEntryType>;
}

/**
 * Wrapper adding a regional cache on an `IncrementalCache` implementation
 */
class RegionalCache implements IncrementalCache {
  public name: string;

  protected localCache: Cache | undefined;

  constructor(
    private store: IncrementalCache,
    private opts: Options
  ) {
    if (this.store.name === KV_CACHE_NAME) {
      throw new Error("The KV incremental cache does not need a regional cache.");
    }
    this.name = this.store.name;
    this.opts.shouldLazilyUpdateOnCacheHit ??= this.opts.mode === "long-lived";
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
        debugCache("Get - cached response");

        // Re-fetch from the store and update the regional cache in the background
        if (this.opts.shouldLazilyUpdateOnCacheHit) {
          getCloudflareContext().ctx.waitUntil(
            this.store.get(key, cacheType).then(async (rawEntry) => {
              const { value, lastModified } = rawEntry ?? {};

              if (value && typeof lastModified === "number") {
                await this.putToCache({ key, cacheType, entry: { value, lastModified } });
              }
            })
          );
        }

        return cachedResponse.json();
      }

      const rawEntry = await this.store.get(key, cacheType);
      const { value, lastModified } = rawEntry ?? {};
      if (!value || typeof lastModified !== "number") return null;

      // Update the locale cache after retrieving from the store.
      getCloudflareContext().ctx.waitUntil(
        this.putToCache({ key, cacheType, entry: { value, lastModified } })
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
      error(`Failed to get from regional cache`, e);
    }
  }

  async delete(key: string): Promise<void> {
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
    const buildId = process.env.NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
    return "http://cache.local" + `/${buildId}/${key}`.replace(/\/+/g, "/") + `.${cacheType ?? "cache"}`;
  }

  protected async putToCache({ key, cacheType, entry }: PutToCacheInput): Promise<void> {
    const urlKey = this.getCacheUrlKey(key, cacheType);
    const cache = await this.getCacheInstance();

    const age =
      this.opts.mode === "short-lived"
        ? ONE_MINUTE_IN_SECONDS
        : entry.value.revalidate || this.opts.defaultLongLivedTtlSec || THIRTY_MINUTES_IN_SECONDS;

    // We default to the entry key if no tags are found.
    // so that we can also revalidate page router based entry this way.
    const tags = getTagsFromCacheEntry(entry) ?? [key];
    await cache.put(
      urlKey,
      new Response(JSON.stringify(entry), {
        headers: new Headers({
          "cache-control": `max-age=${age}`,
          ...(tags.length > 0
            ? {
                "cache-tag": tags.join(","),
              }
            : {}),
        }),
      })
    );
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
 * @param opts.mode The mode to use for the regional cache.
 *                  - `short-lived`: Re-use a cache entry for up to a minute after it has been retrieved.
 *                  - `long-lived`: Re-use a fetch cache entry until it is revalidated (per-region),
 *                                  or an ISR/SSG entry for up to 30 minutes.
 * @param opts.shouldLazilyUpdateOnCacheHit Whether the regional cache entry should be updated in
 *                                          the background or not when it experiences a cache hit.
 * @param opts.defaultLongLivedTtlSec The default age to use for long-lived cache entries.
 *                                  When no revalidate is provided, the default age will be used.
 *                                  @default `THIRTY_MINUTES_IN_SECONDS`
 *
 * @default `false` for the `short-lived` mode, and `true` for the `long-lived` mode.
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
