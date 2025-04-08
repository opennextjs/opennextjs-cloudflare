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

// Hash the keys to limit their length.
// KV has a limit of 512B, R2 has a limit of 1024B.
export const CACHE_KEY_HASH = "sha256";

export const FALLBACK_BUILD_ID = "no-build-id";
