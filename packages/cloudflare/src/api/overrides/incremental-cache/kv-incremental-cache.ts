import { createHash } from "node:crypto";

import { error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, IncrementalCacheEntry } from "../internal.js";

export const NAME = "cf-kv-incremental-cache";

export const BINDING_NAME = "NEXT_INC_CACHE_KV";

export type KeyOptions = {
  isFetch?: boolean;
  buildId?: string;
};

export function computeCacheKey(key: string, options: KeyOptions) {
  const { isFetch = false, buildId = FALLBACK_BUILD_ID } = options;
  const hash = createHash("sha256").update(key).digest("hex");
  return `${buildId}/${hash}.${isFetch ? "fetch" : "cache"}`.replace(/\/+/g, "/");
}

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
    const kv = getCloudflareContext().env[BINDING_NAME];
    if (!kv) throw new IgnorableError("No KV Namespace");

    debugCache(`Get ${key}`);

    try {
      const entry = await kv.get<IncrementalCacheEntry<IsFetch> | CacheValue<IsFetch>>(
        this.getKVKey(key, isFetch),
        "json"
      );

      if (!entry) return null;

      if ("lastModified" in entry) {
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
    const kv = getCloudflareContext().env[BINDING_NAME];
    if (!kv) throw new IgnorableError("No KV Namespace");

    debugCache(`Set ${key}`);

    try {
      await kv.put(
        this.getKVKey(key, isFetch),
        JSON.stringify({
          value,
          // Note: `Date.now()` returns the time of the last IO rather than the actual time.
          //       See https://developers.cloudflare.com/workers/reference/security-model/
          lastModified: Date.now(),
        })
        // TODO: Figure out how to best leverage KV's TTL.
        // NOTE: Ideally, the cache should operate in an SWR-like manner.
      );
    } catch (e) {
      error("Failed to set to cache", e);
    }
  }

  async delete(key: string): Promise<void> {
    const kv = getCloudflareContext().env[BINDING_NAME];
    if (!kv) throw new IgnorableError("No KV Namespace");

    debugCache(`Delete ${key}`);

    try {
      await kv.delete(this.getKVKey(key, /* isFetch= */ false));
    } catch (e) {
      error("Failed to delete from cache", e);
    }
  }

  protected getKVKey(key: string, isFetch?: boolean): string {
    return computeCacheKey(key, {
      buildId: process.env.NEXT_BUILD_ID,
      isFetch,
    });
  }
}

export default new KVIncrementalCache();
