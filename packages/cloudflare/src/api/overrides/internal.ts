import { createHash } from "node:crypto";

import { CacheValue } from "@opennextjs/aws/types/overrides.js";

export type IncrementalCacheEntry<IsFetch extends boolean> = {
  value: CacheValue<IsFetch>;
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
  isFetch: boolean | undefined;
  prefix: string | undefined;
  buildId: string | undefined;
};

export function computeCacheKey(key: string, options: KeyOptions) {
  const { isFetch = false, prefix = DEFAULT_PREFIX, buildId = FALLBACK_BUILD_ID } = options;
  const hash = createHash("sha256").update(key).digest("hex");
  return `${prefix}/${buildId}/${hash}.${isFetch ? "fetch" : "cache"}`.replace(/\/+/g, "/");
}
