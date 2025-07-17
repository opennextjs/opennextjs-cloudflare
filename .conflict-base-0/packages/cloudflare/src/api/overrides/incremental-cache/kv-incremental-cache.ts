import { error } from "@opennextjs/aws/adapters/logger.js";
import type {
	CacheEntryType,
	CacheValue,
	IncrementalCache,
	WithLastModified,
} from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { computeCacheKey, debugCache, IncrementalCacheEntry } from "../internal.js";

export const NAME = "cf-kv-incremental-cache";

export const BINDING_NAME = "NEXT_INC_CACHE_KV";

export const PREFIX_ENV_NAME = "NEXT_INC_CACHE_KV_PREFIX";

/**
 * Open Next cache based on Cloudflare KV.
 *
 * The prefix that the cache entries are stored under can be configured with the `NEXT_INC_CACHE_KV_PREFIX`
 * environment variable, and defaults to `incremental-cache`.
 *
 * Note: The class is instantiated outside of the request context.
 * The cloudflare context and process.env are not initialized yet
 * when the constructor is called.
 */
class KVIncrementalCache implements IncrementalCache {
	readonly name = NAME;

	async get<CacheType extends CacheEntryType = "cache">(
		key: string,
		cacheType?: CacheType
	): Promise<WithLastModified<CacheValue<CacheType>> | null> {
		const kv = getCloudflareContext().env[BINDING_NAME];
		if (!kv) throw new IgnorableError("No KV Namespace");

		debugCache(`Get ${key}`);

		try {
			const entry = await kv.get<IncrementalCacheEntry<CacheType>>(this.getKVKey(key, cacheType), "json");

			if (!entry) return null;

			if ("lastModified" in entry) {
				return entry;
			}

			// if there is no lastModified property, the file was stored during build-time cache population.
			return {
				value: entry,
				lastModified: globalThis.__BUILD_TIMESTAMP_MS__,
			};
		} catch (e) {
			error("Failed to get from cache", e);
			return null;
		}
	}

	async set<CacheType extends CacheEntryType = "cache">(
		key: string,
		value: CacheValue<CacheType>,
		cacheType?: CacheType
	): Promise<void> {
		const kv = getCloudflareContext().env[BINDING_NAME];
		if (!kv) throw new IgnorableError("No KV Namespace");

		debugCache(`Set ${key}`);

		try {
			await kv.put(
				this.getKVKey(key, cacheType),
				JSON.stringify({
					value,
					// Note: `Date.now()` returns the time of the last IO rather than the actual time.
					//       See https://developers.cloudflare.com/workers/reference/security-model/
					lastModified: Date.now(),
				})
				// TODO: Figure out how to best leverage KV's TTL.
				// NOTE: Ideally, the cache should operate in an SWR-like manner.
			);
		} catch (e) {
			error("Failed to set to cache", e);
		}
	}

	async delete(key: string): Promise<void> {
		const kv = getCloudflareContext().env[BINDING_NAME];
		if (!kv) throw new IgnorableError("No KV Namespace");

		debugCache(`Delete ${key}`);

		try {
			// Only cache that gets deleted is the ISR/SSG cache.
			await kv.delete(this.getKVKey(key, "cache"));
		} catch (e) {
			error("Failed to delete from cache", e);
		}
	}

	protected getKVKey(key: string, cacheType?: CacheEntryType): string {
		return computeCacheKey(key, {
			prefix: getCloudflareContext().env[PREFIX_ENV_NAME],
			buildId: process.env.NEXT_BUILD_ID,
			cacheType,
		});
	}
}

export default new KVIncrementalCache();
