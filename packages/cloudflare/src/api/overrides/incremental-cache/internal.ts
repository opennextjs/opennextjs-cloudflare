import { CacheValue } from "@opennextjs/aws/types/overrides.js";

export type IncrementalCacheEntry<IsFetch extends boolean> = {
  value: CacheValue<IsFetch>;
  lastModified: number;
};
