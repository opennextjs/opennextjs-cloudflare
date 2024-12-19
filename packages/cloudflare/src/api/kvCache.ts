/* eslint-disable @typescript-eslint/no-unused-vars */
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Extension } from "@opennextjs/aws/types/cache";
import type { CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides";
import { IgnorableError, RecoverableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./get-cloudflare-context.js";

export const CACHE_ASSET_DIR = "cnd-cgi/_next_cache";

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
      this.debug(`- From KV`);
      const kvKey = this.getKVKey(key, isFetch ? "fetch" : "cache");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = await this.kv?.get(kvKey, "json");
      if (!value && this.assets) {
        const url = this.getAssetUrl(key);
        const response = await this.assets.fetch(url);
        this.debug(`- From Assets`);
        if (response.ok) {
          value = await response.json();
        }
      }
      if (value) {
        this.debug(`-> hit`);
        return { value };
      }
    } catch {
      throw new RecoverableError(`Failed to get cache [${key}]`);
    }

    this.debug(`-> miss`);
    throw new RecoverableError(`Not found [${key}]`);
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
      const kvKey = this.getKVKey(key, isFetch ? "fetch" : "cache");
      // TODO: add TTL to avoid cache growing too big ?
      await this.kv.put(kvKey, JSON.stringify(value));
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
      const kvKey = this.getKVKey(key, "cache");
      await this.kv.delete(kvKey);
    } catch (e) {
      throw new RecoverableError(`Failed to delete cache [${key}]`);
    }
  }

  protected getKVKey(key: string, extension: Extension): string {
    return `${this.getBuildId()}/${key}.${extension}`;
  }

  protected getAssetUrl(key: string): string {
    return `http://assets.local/${CACHE_ASSET_DIR}/${this.getBuildId()}/${key}.cache`.replace(/\/\//g, "/");
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
