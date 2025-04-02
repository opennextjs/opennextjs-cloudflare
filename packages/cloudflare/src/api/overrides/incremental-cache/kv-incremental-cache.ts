import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides";
import { IgnorableError, RecoverableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";

export const CACHE_ASSET_DIR = "cdn-cgi/_next_cache";

export const STATUS_DELETED = 1;

export const NAME = "cf-kv-incremental-cache";

/**
 * Open Next cache based on cloudflare KV and Assets.
 *
 * Note: The class is instantiated outside of the request context.
 * The cloudflare context and process.env are not initialized yet
 * when the constructor is called.
 */
class KVIncrementalCache implements IncrementalCache {
  readonly name = NAME;

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null> {
    const cfEnv = getCloudflareContext().env;
    const kv = cfEnv.NEXT_INC_CACHE_KV;
    const assets = cfEnv.ASSETS;

    if (!(kv || assets)) {
      throw new IgnorableError(`No KVNamespace nor Fetcher`);
    }

    this.debug(`Get ${key}`);

    try {
      let entry: {
        value?: CacheValue<IsFetch>;
        lastModified?: number;
        status?: number;
      } | null = null;

      if (kv) {
        this.debug(`- From KV`);
        const kvKey = this.getKVKey(key, isFetch);
        entry = await kv.get(kvKey, "json");
        if (entry?.status === STATUS_DELETED) {
          return null;
        }
      }

      if (!entry && assets) {
        this.debug(`- From Assets`);
        const url = this.getAssetUrl(key, isFetch);
        const response = await assets.fetch(url);
        if (response.ok) {
          // TODO: consider populating KV with the asset value if faster.
          // This could be optional as KV writes are $$.
          // See https://github.com/opennextjs/opennextjs-cloudflare/pull/194#discussion_r1893166026
          entry = {
            value: await response.json(),
            // __BUILD_TIMESTAMP_MS__ is injected by ESBuild.
            lastModified: (globalThis as { __BUILD_TIMESTAMP_MS__?: number }).__BUILD_TIMESTAMP_MS__,
          };
        }
        if (!kv) {
          // The cache can not be updated when there is no KV
          // As we don't want to keep serving stale data for ever,
          // we pretend the entry is not in cache
          if (
            entry?.value &&
            "kind" in entry.value &&
            entry.value.kind === "FETCH" &&
            entry.value.data?.headers?.expires
          ) {
            const expiresTime = new Date(entry.value.data.headers.expires).getTime();
            if (!isNaN(expiresTime) && expiresTime <= Date.now()) {
              this.debug(`found expired entry (expire time: ${entry.value.data.headers.expires})`);
              return null;
            }
          }
        }
      }

      this.debug(entry ? `-> hit` : `-> miss`);
      return { value: entry?.value, lastModified: entry?.lastModified };
    } catch {
      throw new RecoverableError(`Failed to get cache [${key}]`);
    }
  }

  async set<IsFetch extends boolean = false>(
    key: string,
    value: CacheValue<IsFetch>,
    isFetch?: IsFetch
  ): Promise<void> {
    const kv = getCloudflareContext().env.NEXT_INC_CACHE_KV;

    if (!kv) {
      throw new IgnorableError(`No KVNamespace`);
    }

    this.debug(`Set ${key}`);

    try {
      const kvKey = this.getKVKey(key, isFetch);
      // Note: We can not set a TTL as we might fallback to assets,
      //       still removing old data (old BUILD_ID) could help avoiding
      //       the cache growing too big.
      await kv.put(
        kvKey,
        JSON.stringify({
          value,
          // Note: `Date.now()` returns the time of the last IO rather than the actual time.
          //       See https://developers.cloudflare.com/workers/reference/security-model/
          lastModified: Date.now(),
        })
      );
    } catch {
      throw new RecoverableError(`Failed to set cache [${key}]`);
    }
  }

  async delete(key: string): Promise<void> {
    const kv = getCloudflareContext().env.NEXT_INC_CACHE_KV;

    if (!kv) {
      throw new IgnorableError(`No KVNamespace`);
    }

    this.debug(`Delete ${key}`);

    try {
      const kvKey = this.getKVKey(key, /* isFetch= */ false);
      // Do not delete the key as we would then fallback to the assets.
      await kv.put(kvKey, JSON.stringify({ status: STATUS_DELETED }));
    } catch {
      throw new RecoverableError(`Failed to delete cache [${key}]`);
    }
  }

  protected getKVKey(key: string, isFetch?: boolean): string {
    return `${this.getBuildId()}/${key}.${isFetch ? "fetch" : "cache"}`;
  }

  protected getAssetUrl(key: string, isFetch?: boolean): string {
    return isFetch
      ? `http://assets.local/${CACHE_ASSET_DIR}/__fetch/${this.getBuildId()}/${key}`
      : `http://assets.local/${CACHE_ASSET_DIR}/${this.getBuildId()}/${key}.cache`;
  }

  protected debug(...args: unknown[]) {
    if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
      console.log(`[Cache ${this.name}] `, ...args);
    }
  }

  protected getBuildId() {
    return process.env.NEXT_BUILD_ID ?? "no-build-id";
  }
}

export default new KVIncrementalCache();
