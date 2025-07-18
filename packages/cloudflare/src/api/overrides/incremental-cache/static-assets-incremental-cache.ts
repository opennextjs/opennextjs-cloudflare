import { error } from "@opennextjs/aws/adapters/logger.js";
import type {
	CacheEntryType,
	CacheValue,
	IncrementalCache,
	WithLastModified,
} from "@opennextjs/aws/types/overrides.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID } from "../internal.js";

//  Assets inside `cdn-cgi/...` are only accessible by the worker.
export const CACHE_DIR = "cdn-cgi/_next_cache";

export const NAME = "cf-static-assets-incremental-cache";

/**
 * This cache uses Workers static assets.
 *
 * It should only be used for applications that do NOT want revalidation and ONLY want to serve prerendered data.
 */
class StaticAssetsIncrementalCache implements IncrementalCache {
	readonly name = NAME;

	async get<CacheType extends CacheEntryType = "cache">(
		key: string,
		cacheType?: CacheType
	): Promise<WithLastModified<CacheValue<CacheType>> | null> {
		const assets = getCloudflareContext().env.ASSETS;
		if (!assets) throw new IgnorableError("No Static Assets");

		debugCache(`Get ${key}`);

		try {
			const response = await assets.fetch(this.getAssetUrl(key, cacheType));
			if (!response.ok) {
				await response.body?.cancel();
				return null;
			}

			return {
				value: await response.json(),
				lastModified: globalThis.__BUILD_TIMESTAMP_MS__,
			};
		} catch (e) {
			error("Failed to get from cache", e);
			return null;
		}
	}

	async set(): Promise<void> {
		error("Failed to set to read-only cache");
	}

	async delete(): Promise<void> {
		error("Failed to delete from read-only cache");
	}

	protected getAssetUrl(key: string, cacheType?: CacheEntryType): string {
		if (cacheType === "composable") {
			throw new Error("Composable cache is not supported in static assets incremental cache");
		}
		const buildId = process.env.NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
		const name = (
			cacheType === "fetch"
				? `${CACHE_DIR}/__fetch/${buildId}/${key}`
				: `${CACHE_DIR}/${buildId}/${key}.cache`
		).replace(/\/+/g, "/");
		return `http://assets.local/${name}`;
	}
}

export default new StaticAssetsIncrementalCache();
