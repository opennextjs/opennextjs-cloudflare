import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context.js";
import { IncrementalCacheEntry } from "./internal/incremental-cache.js";

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

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    const r2 = getCloudflareContext().env.NEXT_CACHE_R2_BUCKET;
    if (!r2) throw new IgnorableError("No R2 bucket");

    debug(`Get ${key}`);

    try {
      const r2Object = await r2.get(this.getR2Key(key, isFetch));
      if (!r2Object) return null;

      return r2Object.json();
    } catch (e) {
      error("Failed to get from cache", e);
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
      const entry: IncrementalCacheEntry<IsFetch> = {
        value,
        // Note: `Date.now()` returns the time of the last IO rather than the actual time.
        //       See https://developers.cloudflare.com/workers/reference/security-model/
        lastModified: Date.now(),
      };

      await r2.put(this.getR2Key(key, isFetch), JSON.stringify(entry));
    } catch (e) {
      error("Failed to set to cache", e);
    }
  }

  async delete(key: string): Promise<void> {
    const r2 = getCloudflareContext().env.NEXT_CACHE_R2_BUCKET;
    if (!r2) throw new IgnorableError("No R2 bucket");

    debug(`Delete ${key}`);

    try {
      await r2.delete(this.getR2Key(key));
    } catch (e) {
      error("Failed to delete from cache", e);
    }
  }

  protected getR2Key(key: string, isFetch?: boolean): string {
    const directory = getCloudflareContext().env.NEXT_CACHE_R2_PREFIX ?? "incremental-cache";

    return `${directory}/${process.env.NEXT_BUILD_ID ?? "no-build-id"}/${key}.${isFetch ? "fetch" : "cache"}`;
  }
}

export default new R2IncrementalCache();
