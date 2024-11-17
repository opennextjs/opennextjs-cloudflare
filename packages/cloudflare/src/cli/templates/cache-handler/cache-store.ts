import type { IncrementalCacheValue } from "next/dist/server/response-cache";

export type CacheEntry = {
  lastModified: number;
  value: IncrementalCacheValue | null;
};

export type CacheStore = {
  get: (key: string) => Promise<CacheEntry | null>;
  put: (key: string, entry: CacheEntry, ttl?: number) => Promise<void>;
};

export function getCacheStore() {
  const kvName = process.env.__OPENNEXT_KV_BINDING_NAME;
  if (kvName && process.env[kvName]) {
    return new KVStore(process.env[kvName] as unknown as KVNamespace);
  }
}

const defaultTTL = 31536000; // 1 year

class KVStore implements CacheStore {
  constructor(private store: KVNamespace) {}

  get(key: string) {
    return this.store.get<CacheEntry>(key, "json");
  }

  put(key: string, entry: CacheEntry, ttl = defaultTTL) {
    return this.store.put(key, JSON.stringify(entry), { expirationTtl: ttl });
  }
}
