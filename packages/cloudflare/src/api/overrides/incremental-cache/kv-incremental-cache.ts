import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { IncrementalCacheEntry } from "./internal.js";

export const NAME = "cf-kv-incremental-cache";

/**
 * Open Next cache based on Cloudflare KV.
 *
 * Note: The class is instantiated outside of the request context.
 * The cloudflare context and process.env are not initialized yet
 * when the constructor is called.
 */
class KVIncrementalCache implements IncrementalCache {
  readonly name = NAME;

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    const kv = getCloudflareContext().env.NEXT_INC_CACHE_KV;
    if (!kv) throw new IgnorableError("No KV Namespace");

    debug(`Get ${key}`);

    try {
      const entry = await kv.get<IncrementalCacheEntry<IsFetch> | CacheValue<IsFetch>>(
        this.getKVKey(key, isFetch),
        "json"
      );

      if (!entry || "lastModified" in entry) {
        return entry;
      }

      // if there is no lastModified property, the file was stored during build-time cache population.
      return {
        value: entry,
        // __BUILD_TIMESTAMP_MS__ is injected by ESBuild.
        lastModified: (globalThis as { __BUILD_TIMESTAMP_MS__?: number }).__BUILD_TIMESTAMP_MS__,
      };
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
    const kv = getCloudflareContext().env.NEXT_INC_CACHE_KV;
    if (!kv) throw new IgnorableError("No KV Namespace");

    debug(`Set ${key}`);

    try {
      await kv.put(
        this.getKVKey(key, isFetch),
        JSON.stringify({
          value,
          // Note: `Date.now()` returns the time of the last IO rather than the actual time.
          //       See https://developers.cloudflare.com/workers/reference/security-model/
          lastModified: Date.now(),
        }),
        {
          // When available, we only cache for the max revalidate time
          ...(value.revalidate && {
            expirationTtl: value.revalidate,
          }),
        }
      );
    } catch (e) {
      error("Failed to set to cache", e);
    }
  }

  async delete(key: string): Promise<void> {
    const kv = getCloudflareContext().env.NEXT_INC_CACHE_KV;
    if (!kv) throw new IgnorableError("No KV Namespace");

    debug(`Delete ${key}`);

    try {
      await kv.delete(this.getKVKey(key, /* isFetch= */ false));
    } catch (e) {
      error("Failed to delete from cache", e);
    }
  }

  protected getKVKey(key: string, isFetch?: boolean): string {
    const buildId = process.env.NEXT_BUILD_ID ?? "no-build-id";
    return `${buildId}/${key}.${isFetch ? "fetch" : "cache"}`.replace(/\/+/g, "/");
  }
}

export default new KVIncrementalCache();
