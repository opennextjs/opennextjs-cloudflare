import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "./cloudflare-context.js";
import { IncrementalCacheEntry } from "./internal/incremental-cache.js";

const ONE_YEAR_IN_SECONDS = 31536000;
const ONE_MINUTE_IN_SECONDS = 60;

type Options = {
  mode: "short-lived" | "long-lived";
};

class RegionalCache implements IncrementalCache {
  public name: string;

  protected localCache: Cache | undefined;

  constructor(
    private store: IncrementalCache,
    private opts: Options
  ) {
    this.name = this.store.name;
  }

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    try {
      const storeResponse = this.store.get(key, isFetch);

      const localCacheKey = this.getCacheKey(key, isFetch);

      // Check for a cached entry as this will be faster than the store response.
      const cache = await this.getCacheInstance();
      const cachedResponse = await cache.match(localCacheKey);
      if (cachedResponse) {
        debug("Get - cached response");

        // Update the local cache after the R2 fetch has completed.
        getCloudflareContext().ctx.waitUntil(
          Promise.resolve(storeResponse).then(async (rawEntry) => {
            const { value, lastModified } = rawEntry ?? {};

            if (value && typeof lastModified === "number") {
              await this.putToCache(localCacheKey, { value, lastModified });
            }
          })
        );

        return cachedResponse.json();
      }

      const rawEntry = await storeResponse;
      const { value, lastModified } = rawEntry ?? {};
      if (!value || typeof lastModified !== "number") return null;

      // Update the locale cache after retrieving from the store.
      getCloudflareContext().ctx.waitUntil(this.putToCache(localCacheKey, { value, lastModified }));

      return { value, lastModified };
    } catch (e) {
      error("Failed to get from regional cache", e);
      return null;
    }
  }

  async set<IsFetch extends boolean = false>(
    key: string,
    value: CacheValue<IsFetch>,
    isFetch?: IsFetch
  ): Promise<void> {
    try {
      await Promise.all([
        this.store.set(key, value, isFetch),
        this.putToCache(this.getCacheKey(key, isFetch), {
          value,
          // Note: `Date.now()` returns the time of the last IO rather than the actual time.
          //       See https://developers.cloudflare.com/workers/reference/security-model/
          lastModified: Date.now(),
        }),
      ]);
    } catch (e) {
      error(`Failed to get from regional cache`, e);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const cache = await this.getCacheInstance();
      await Promise.all([this.store.delete(key), cache.delete(this.getCacheKey(key))]);
    } catch (e) {
      error("Failed to delete from regional cache", e);
    }
  }

  protected async getCacheInstance(): Promise<Cache> {
    if (this.localCache) return this.localCache;

    this.localCache = await caches.open("incremental-cache");
    return this.localCache;
  }

  protected getCacheKey(key: string, isFetch?: boolean) {
    return new Request(
      new URL(
        `${process.env.NEXT_BUILD_ID ?? "no-build-id"}/${key}.${isFetch ? "fetch" : "cache"}`,
        "http://cache.local"
      )
    );
  }

  protected async putToCache(key: Request, entry: IncrementalCacheEntry<boolean>): Promise<void> {
    const cache = await this.getCacheInstance();

    const age =
      this.opts.mode === "short-lived"
        ? ONE_MINUTE_IN_SECONDS
        : entry.value.revalidate || ONE_YEAR_IN_SECONDS;

    await cache.put(
      key,
      new Response(JSON.stringify(entry), {
        headers: new Headers({ "cache-control": `max-age=${age}` }),
      })
    );
  }
}

export function withRegionalCache(cache: IncrementalCache, opts: Options) {
  return new RegionalCache(cache, opts);
}
