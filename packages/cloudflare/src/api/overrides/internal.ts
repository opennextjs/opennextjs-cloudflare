import { createHash } from "node:crypto";

import type { CacheEntryType, CacheValue } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../cloudflare-context.js";

export type IncrementalCacheEntry<CacheType extends CacheEntryType> = {
  value: CacheValue<CacheType>;
  lastModified: number;
};

export const debugCache = (name: string, ...args: unknown[]) => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.log(`[${name}] `, ...args);
  }
};

export const FALLBACK_BUILD_ID = "no-build-id";

export const DEFAULT_PREFIX = "incremental-cache";

export type KeyOptions = {
  cacheType?: CacheEntryType;
  prefix: string | undefined;
  buildId: string | undefined;
};

export function computeCacheKey(key: string, options: KeyOptions) {
  const { cacheType = "cache", prefix = DEFAULT_PREFIX, buildId = FALLBACK_BUILD_ID } = options;
  const hash = createHash("sha256").update(key).digest("hex");
  return `${prefix}/${buildId}/${hash}.${cacheType}`.replace(/\/+/g, "/");
}

export async function purgeCacheByTags(tags: string[]) {
  const { env } = getCloudflareContext();

  if (!env.CACHE_ZONE_ID && !env.CACHE_API_TOKEN) {
    // THIS IS A NO-OP
    debugCache("purgeCacheByTags", "No cache zone ID or API token provided. Skipping cache purge.");
    return;
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CACHE_ZONE_ID}/purge_cache`,
      {
        headers: {
          Authorization: `Bearer ${env.CACHE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          tags,
        }),
      }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to purge cache: ${response.status} ${text}`);
    }
    const bodyResponse = (await response.json()) as {
      success: boolean;
      errors: Array<{ code: number; message: string }>;
      messages: Array<{ code: number; message: string }>;
    };
    if (!bodyResponse.success) {
      throw new Error(`Failed to purge cache: ${JSON.stringify(bodyResponse.errors)}`);
    }
    debugCache("purgeCacheByTags", "Cache purged successfully for tags:", tags);
  } catch (error) {
    console.error("Error purging cache by tags:", error);
  }
}
