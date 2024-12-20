import type { KVNamespace } from "@cloudflare/workers-types";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides";
import { IgnorableError, RecoverableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./get-cloudflare-context.js";

export const CACHE_ASSET_DIR = "cnd-cgi/_next_cache";

export const STATUS_DELETED = 1;

/**
 * Open Next cache based on cloudflare KV and Assets.
 *
 * Note: The class is instantiated outside of the request context.
 * The cloudflare context and process.env are not initialzed yet
 * when the constructor is called.
 */
class Cache implements IncrementalCache {
  readonly name = "cloudflare-kv";
  protected initialized = false;
  protected kv: KVNamespace | undefined;
  protected assets: Fetcher | undefined;

  async get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch
  ): Promise<WithLastModified<CacheValue<IsFetch>>> {
    if (!this.initialized) {
      await this.init();
    }

    if (!(this.kv || this.assets)) {
      throw new IgnorableError(`No KVNamespace nor Fetcher`);
    }

    this.debug(`Get ${key}`);

    try {
      let entry: {
        value?: CacheValue<IsFetch>;
        lastModified?: number;
        status?: number;
      } | null = null;

      if (this.kv) {
        this.debug(`- From KV`);
        const kvKey = this.getKVKey(key, isFetch);
        entry = await this.kv.get(kvKey, "json");
        if (entry?.status === STATUS_DELETED) {
          return {};
        }
      }

      if (!entry && this.assets) {
        this.debug(`- From Assets`);
        const url = this.getAssetUrl(key, isFetch);
        const response = await this.assets.fetch(url);
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
    if (!this.initialized) {
      await this.init();
    }
    if (!this.kv) {
      throw new IgnorableError(`No KVNamespace`);
    }
    this.debug(`Set ${key}`);
    try {
      const kvKey = this.getKVKey(key, isFetch);
      // Note: We can not set a TTL as we might fallback to assets,
      //       still removing old data (old BUILD_ID) could help avoiding
      //       the cache growing too big.
      await this.kv.put(
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
    if (!this.initialized) {
      await this.init();
    }
    if (!this.kv) {
      throw new IgnorableError(`No KVNamespace`);
    }
    this.debug(`Delete ${key}`);
    try {
      const kvKey = this.getKVKey(key, /* isFetch= */ false);
      // Do not delete the key as we would then fallback to the assets.
      await this.kv.put(kvKey, JSON.stringify({ status: STATUS_DELETED }));
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

  protected async init() {
    const env = (await getCloudflareContext()).env;
    this.kv = env.NEXT_CACHE_WORKERS_KV;
    this.assets = env.ASSETS;
    this.initialized = true;
  }
}

export default new Cache();
