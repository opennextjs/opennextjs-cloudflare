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
  if (process.env[kvName]) {
    return new KVStore(process.env[kvName] as unknown as KVNamespace);
  }

  return new CacheAPIStore();
}

const oneYearInMs = 31536000;

class KVStore implements CacheStore {
  constructor(private store: KVNamespace) {}

  get(key: string) {
    return this.store.get<CacheEntry>(key, "json");
  }

  put(key: string, entry: CacheEntry, ttl = oneYearInMs) {
    return this.store.put(key, JSON.stringify(entry), {
      expirationTtl: ttl,
    });
  }
}

class CacheAPIStore implements CacheStore {
  constructor(private name = "__opennext_cache") {}

  async get(key: string) {
    const cache = await caches.open(this.name);
    const response = await cache.match(this.createCacheKey(key));

    if (response) {
      return response.json<CacheEntry>();
    }

    return null;
  }

  async put(key: string, entry: CacheEntry, ttl = oneYearInMs) {
    const cache = await caches.open(this.name);

    const response = new Response(JSON.stringify(entry), {
      headers: { "cache-control": `max-age=${ttl}` },
    });

    return cache.put(this.createCacheKey(key), response);
  }

  private createCacheKey(key: string) {
    return `https://${this.name}.local/entry/${key}`;
  }
}
