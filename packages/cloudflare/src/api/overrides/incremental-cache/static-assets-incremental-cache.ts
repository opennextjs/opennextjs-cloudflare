import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";

export const CACHE_DIR = "cdn-cgi/_next_cache";

export const NAME = "cf-static-assets-incremental-cache";

/**
 * This cache uses Workers static assets and is not recommended. It should only be used for applications
 * that do NOT want revalidation and ONLY want to serve pre-rendered data.
 */
class StaticAssetsIncrementalCache implements IncrementalCache {
  readonly name = NAME;

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    const assets = getCloudflareContext().env.ASSETS;
    if (!assets) throw new IgnorableError("No Static Assets");

    debug(`Get ${key}`);

    try {
      const response = await assets.fetch(this.getAssetUrl(key, isFetch));
      if (!response.ok) return null;

      return {
        value: await response.json(),
        // __BUILD_TIMESTAMP_MS__ is injected by ESBuild.
        lastModified: (globalThis as { __BUILD_TIMESTAMP_MS__?: number }).__BUILD_TIMESTAMP_MS__,
      };
    } catch (e) {
      error("Failed to get from cache", e);
      return null;
    }
  }

  async set(): Promise<void> {}

  async delete(): Promise<void> {}

  protected getAssetUrl(key: string, isFetch?: boolean): string {
    const buildId = process.env.NEXT_BUILD_ID ?? "no-build-id";
    const name = `${CACHE_DIR}/${buildId}/${key}.${isFetch ? "fetch" : "cache"}`.replace(/\/+/g, "/");
    return `http://assets.local/${name}`;
  }
}

export default new StaticAssetsIncrementalCache();
