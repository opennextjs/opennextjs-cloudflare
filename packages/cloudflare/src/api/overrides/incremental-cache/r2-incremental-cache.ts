import { error } from "@opennextjs/aws/adapters/logger.js";
import type {
  CacheEntryType,
  CacheValue,
  IncrementalCache,
  WithLastModified,
} from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { computeCacheKey, debugCache } from "../internal.js";

export const NAME = "cf-r2-incremental-cache";

export const BINDING_NAME = "NEXT_INC_CACHE_R2_BUCKET";

export const PREFIX_ENV_NAME = "NEXT_INC_CACHE_R2_PREFIX";

/**
 * An instance of the Incremental Cache that uses an R2 bucket (`NEXT_INC_CACHE_R2_BUCKET`) as it's
 * underlying data store.
 *
 * The directory that the cache entries are stored in can be configured with the `NEXT_INC_CACHE_R2_PREFIX`
 * environment variable, and defaults to `incremental-cache`.
 */
class R2IncrementalCache implements IncrementalCache {
  readonly name = NAME;

  async get<CacheType extends CacheEntryType = "cache">(
    key: string,
    cacheType?: CacheType
  ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
    const r2 = getCloudflareContext().env[BINDING_NAME];
    if (!r2) throw new IgnorableError("No R2 bucket");

    debugCache(`Get ${key}`);

    try {
      const r2Object = await r2.get(this.getR2Key(key, cacheType));
      if (!r2Object) return null;

      return {
        value: await r2Object.json(),
        lastModified: r2Object.uploaded.getTime(),
      };
    } catch (e) {
      error("Failed to get from cache", e);
      return null;
    }
  }

  async set<CacheType extends CacheEntryType = "cache">(
    key: string,
    value: CacheValue<CacheType>,
    cacheType?: CacheType
  ): Promise<void> {
    const r2 = getCloudflareContext().env[BINDING_NAME];
    if (!r2) throw new IgnorableError("No R2 bucket");

    debugCache(`Set ${key}`);

    try {
      await r2.put(this.getR2Key(key, cacheType), JSON.stringify(value));
    } catch (e) {
      error("Failed to set to cache", e);
    }
  }

  async delete(key: string): Promise<void> {
    const r2 = getCloudflareContext().env[BINDING_NAME];
    if (!r2) throw new IgnorableError("No R2 bucket");

    debugCache(`Delete ${key}`);

    try {
      await r2.delete(this.getR2Key(key));
    } catch (e) {
      error("Failed to delete from cache", e);
    }
  }

  protected getR2Key(key: string, cacheType?: CacheEntryType): string {
    return computeCacheKey(key, {
      prefix: getCloudflareContext().env[PREFIX_ENV_NAME],
      buildId: process.env.NEXT_BUILD_ID,
      cacheType,
    });
  }
}

export default new R2IncrementalCache();
