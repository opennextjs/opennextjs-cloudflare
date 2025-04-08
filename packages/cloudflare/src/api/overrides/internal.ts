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
