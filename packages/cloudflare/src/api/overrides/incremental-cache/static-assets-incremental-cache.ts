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

	/**
	 * Reads a cache entry from the Workers static assets.
	 *
	 * @param key The cache key.
	 * @param cacheType The type of the cache entry.
	 * @returns The cache entry, or `null` when it does not exist, the key is invalid, or the read fails.
	 * @throws {IgnorableError} When the `ASSETS` binding is not configured.
	 */
	async get<CacheType extends CacheEntryType = "cache">(
		key: string,
		cacheType?: CacheType
	): Promise<WithLastModified<CacheValue<CacheType>> | null> {
		const assets = getCloudflareContext().env.ASSETS;
		if (!assets) throw new IgnorableError("No Static Assets");

		debugCache("StaticAssetsIncrementalCache", `get ${key}`);

		try {
			const url = this.getAssetUrl(key, cacheType);
			if (url === null) {
				debugCache("StaticAssetsIncrementalCache", `invalid key ${key}`);
				return null;
			}
			// The asset server redirects non-canonical URLs. `getAssetUrl` only returns canonical URLs,
			// any redirect is treated as a miss rather than followed.
			const response = await assets.fetch(url, { redirect: "manual" });
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

	async set<CacheType extends CacheEntryType = "cache">(
		key: string,
		_value: CacheValue<CacheType>,
		cacheType?: CacheType
	): Promise<void> {
		error(`StaticAssetsIncrementalCache: Failed to set to read-only cache key=${key} type=${cacheType}`);
	}

	async delete(): Promise<void> {
		error("StaticAssetsIncrementalCache: Failed to delete from read-only cache");
	}

	/**
	 * Returns the URL of the asset holding the cache entry for `key`.
	 *
	 * The key is opaque and may contain characters that are meaningful in a URL (`%`, `$`, `?`, ...).
	 * The asset server decodes each segment of the URL path to locate the file, and redirects when the
	 * path is not in canonical form. Each segment is encoded the same way the asset server does so that:
	 * - the decoded path is exactly the key, and can not resolve to a different entry,
	 * - the URL is canonical, and the asset server serves the file without redirecting.
	 *
	 * @param key The cache key.
	 * @param cacheType The type of the cache entry.
	 * @returns The asset URL, or `null` when the key contains a `.` or `..` segment that the URL parser would resolve.
	 * @throws {Error} When `cacheType` is "composable", which is not supported.
	 */
	protected getAssetUrl(key: string, cacheType?: CacheEntryType): string | null {
		if (cacheType === "composable") {
			throw new Error("Composable cache is not supported in static assets incremental cache");
		}
		const buildId = process.env.OPEN_NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
		const segments = (
			cacheType === "fetch"
				? `${CACHE_DIR}/__fetch/${buildId}/${key}`
				: `${CACHE_DIR}/${buildId}/${key}.cache`
		)
			.replace(/\/+/g, "/")
			.split("/");
		if (segments.some((segment) => segment === "." || segment === "..")) {
			return null;
		}
		return `http://assets.local/${segments.map(encodeURIComponent).join("/")}`;
	}
}

export default new StaticAssetsIncrementalCache();
