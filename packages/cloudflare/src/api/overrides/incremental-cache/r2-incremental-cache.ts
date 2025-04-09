import { createHash } from "node:crypto";

import { error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID } from "../internal.js";

export const NAME = "cf-r2-incremental-cache";

export const BINDING_NAME = "NEXT_INC_CACHE_R2_BUCKET";

export const PREFIX_ENV_NAME = "NEXT_INC_CACHE_R2_PREFIX";
export const DEFAULT_PREFIX = "incremental-cache";

export type KeyOptions = {
  isFetch?: boolean;
  directory?: string;
  buildId?: string;
};

export function computeCacheKey(key: string, options: KeyOptions) {
  const { isFetch = false, directory = DEFAULT_PREFIX, buildId = FALLBACK_BUILD_ID } = options;
  const hash = createHash("sha256").update(key).digest("hex");
  return `${directory}/${buildId}/${hash}.${isFetch ? "fetch" : "cache"}`.replace(/\/+/g, "/");
}

/**
 * An instance of the Incremental Cache that uses an R2 bucket (`NEXT_INC_CACHE_R2_BUCKET`) as it's
 * underlying data store.
 *
 * The directory that the cache entries are stored in can be configured with the `NEXT_INC_CACHE_R2_PREFIX`
 * environment variable, and defaults to `incremental-cache`.
 */
class R2IncrementalCache implements IncrementalCache {
  readonly name = NAME;

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    const r2 = getCloudflareContext().env[BINDING_NAME];
    if (!r2) throw new IgnorableError("No R2 bucket");

    debugCache(`Get ${key}`);

    try {
      const r2Object = await r2.get(this.getR2Key(key, isFetch));
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

  async set<IsFetch extends boolean = false>(
    key: string,
    value: CacheValue<IsFetch>,
    isFetch?: IsFetch
  ): Promise<void> {
    const r2 = getCloudflareContext().env[BINDING_NAME];
    if (!r2) throw new IgnorableError("No R2 bucket");

    debugCache(`Set ${key}`);

    try {
      await r2.put(this.getR2Key(key, isFetch), JSON.stringify(value));
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

  protected getR2Key(key: string, isFetch?: boolean): string {
    return computeCacheKey(key, {
      directory: getCloudflareContext().env[PREFIX_ENV_NAME],
      buildId: process.env.NEXT_BUILD_ID,
      isFetch,
    });
  }
}

export default new R2IncrementalCache();
