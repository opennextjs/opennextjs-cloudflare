import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context.js";

type Entry<IsFetch extends boolean> = {
  value: CacheValue<IsFetch>;
  lastModified: number;
};

const ONE_YEAR_IN_SECONDS = 31536000;

/**
 * An instance of the Incremental Cache that uses an R2 bucket (`NEXT_CACHE_R2_BUCKET`) as it's
 * underlying data store.
 *
 * The directory that the cache entries are stored in can be confused with the `NEXT_CACHE_R2_PREFIX`
 * environment variable, and defaults to `incremental-cache`.
 *
 * The cache uses an instance of the Cache API (`incremental-cache`) to store a local version of the
 * R2 cache entry to enable fast retrieval, with the cache being updated from R2 in the background.
 */
class R2IncrementalCache implements IncrementalCache {
  readonly name = "r2-incremental-cache";

  protected localCache: Cache | undefined;

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    const r2 = getCloudflareContext().env.NEXT_CACHE_R2_BUCKET;
    if (!r2) throw new IgnorableError("No R2 bucket");

    debug(`Get ${key}`);

    try {
      const r2Response = r2.get(this.getR2Key(key));

      const localCacheKey = this.getLocalCacheKey(key, isFetch);

      // Check for a cached entry as this will be faster than R2.
      const cachedResponse = await this.getFromLocalCache(localCacheKey);
      if (cachedResponse) {
        debug(` -> Cached response`);
        // Update the local cache after the R2 fetch has completed.
        getCloudflareContext().ctx.waitUntil(
          Promise.resolve(r2Response).then(async (res) => {
            if (res) {
              const entry: Entry<IsFetch> = await res.json();
              await this.putToLocalCache(localCacheKey, JSON.stringify(entry), entry.value.revalidate);
            }
          })
        );

        return cachedResponse.json();
      }

      const r2Object = await r2Response;
      if (!r2Object) return null;
      const entry: Entry<IsFetch> = await r2Object.json();

      // Update the locale cache after retrieving from R2.
      getCloudflareContext().ctx.waitUntil(
        this.putToLocalCache(localCacheKey, JSON.stringify(entry), entry.value.revalidate)
      );

      return entry;
    } catch (e) {
      error(`Failed to get from cache`, e);
      return null;
    }
  }

  async set<IsFetch extends boolean = false>(
    key: string,
    value: CacheValue<IsFetch>,
    isFetch?: IsFetch
  ): Promise<void> {
    const r2 = getCloudflareContext().env.NEXT_CACHE_R2_BUCKET;
    if (!r2) throw new IgnorableError("No R2 bucket");

    debug(`Set ${key}`);

    try {
      const entry: Entry<IsFetch> = {
        value,
        // Note: `Date.now()` returns the time of the last IO rather than the actual time.
        //       See https://developers.cloudflare.com/workers/reference/security-model/
        lastModified: Date.now(),
      };

      await Promise.all([
        r2.put(this.getR2Key(key, isFetch), JSON.stringify(entry)),
        // Update the locale cache for faster retrieval.
        this.putToLocalCache(
          this.getLocalCacheKey(key, isFetch),
          JSON.stringify(entry),
          entry.value.revalidate
        ),
      ]);
    } catch (e) {
      error(`Failed to set to cache`, e);
    }
  }

  async delete(key: string): Promise<void> {
    const r2 = getCloudflareContext().env.NEXT_CACHE_R2_BUCKET;
    if (!r2) throw new IgnorableError("No R2 bucket");

    debug(`Delete ${key}`);

    try {
      await Promise.all([
        r2.delete(this.getR2Key(key)),
        this.deleteFromLocalCache(this.getLocalCacheKey(key)),
      ]);
    } catch (e) {
      error(`Failed to delete from cache`, e);
    }
  }

  protected getBaseCacheKey(key: string, isFetch?: boolean): string {
    return `${process.env.NEXT_BUILD_ID ?? "no-build-id"}/${key}.${isFetch ? "fetch" : "cache"}`;
  }

  protected getR2Key(key: string, isFetch?: boolean): string {
    const directory = getCloudflareContext().env.NEXT_CACHE_R2_PREFIX ?? "incremental-cache";
    return `${directory}/${this.getBaseCacheKey(key, isFetch)}`;
  }

  protected getLocalCacheKey(key: string, isFetch?: boolean) {
    return new Request(new URL(this.getBaseCacheKey(key, isFetch), "http://cache.local"));
  }

  protected async getLocalCacheInstance(): Promise<Cache> {
    if (this.localCache) return this.localCache;

    this.localCache = await caches.open("incremental-cache");
    return this.localCache;
  }

  protected async getFromLocalCache(key: Request) {
    const cache = await this.getLocalCacheInstance();
    return cache.match(key);
  }

  protected async putToLocalCache(
    key: Request,
    entry: string,
    revalidate: number | false | undefined
  ): Promise<void> {
    const cache = await this.getLocalCacheInstance();
    await cache.put(
      key,
      new Response(entry, {
        headers: new Headers({
          "cache-control": `max-age=${revalidate || ONE_YEAR_IN_SECONDS}`,
        }),
      })
    );
  }

  protected async deleteFromLocalCache(key: Request) {
    const cache = await this.getLocalCacheInstance();
    await cache.delete(key);
  }
}

export default new R2IncrementalCache();
