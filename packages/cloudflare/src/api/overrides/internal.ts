import { createHash } from "node:crypto";

import { error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheEntryType, CacheValue } from "@opennextjs/aws/types/overrides.js";

export type IncrementalCacheEntry<CacheType extends CacheEntryType> = {
	value: CacheValue<CacheType>;
	lastModified: number;
};

export const debugCache = (name: string, ...args: unknown[]) => {
	if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
		console.log(`[${name}] `, ...args);
	}
};

export const FALLBACK_BUILD_ID = "no-build-id";

export const DEFAULT_PREFIX = "incremental-cache";

export type KeyOptions = {
	cacheType?: CacheEntryType;
	prefix: string | undefined;
	buildId: string | undefined;
};

export function computeCacheKey(key: string, options: KeyOptions) {
	const { cacheType = "cache", prefix = DEFAULT_PREFIX, buildId = FALLBACK_BUILD_ID } = options;
	const hash = createHash("sha256").update(key).digest("hex");
	return `${prefix}/${buildId}/${hash}.${cacheType}`.replace(/\/+/g, "/");
}

export function isPurgeCacheEnabled(): boolean {
	// The `?` is required at `openNextConfig?` or the Open Next build fails because of a type error
	const cdnInvalidation = globalThis.openNextConfig?.default?.override?.cdnInvalidation;

	return cdnInvalidation !== undefined && cdnInvalidation !== "dummy";
}

/**
 * Purges Cloudflare cache entries associated with the provided tags.
 *
 * This calls the Cloudflare cache purge API directly and reports failures as status values.
 *
 * @param env Cloudflare environment containing the zone ID and API token.
 * @param tags Cache tags to purge.
 * @returns The purge outcome: success, missing credentials, rate limiting, or failure.
 */
export async function internalPurgeCacheByTags(env: CloudflareEnv, tags: string[]) {
	if (!env.CACHE_PURGE_ZONE_ID || !env.CACHE_PURGE_API_TOKEN) {
		// THIS IS A NO-OP
		error("No cache zone ID or API token provided. Skipping cache purge.");
		return "missing-credentials";
	}

	let response: Response | undefined;
	try {
		response = await fetch(
			`https://api.cloudflare.com/client/v4/zones/${env.CACHE_PURGE_ZONE_ID}/purge_cache`,
			{
				headers: {
					Authorization: `Bearer ${env.CACHE_PURGE_API_TOKEN}`,
					"Content-Type": "application/json",
				},
				method: "POST",
				body: JSON.stringify({
					tags,
				}),
			}
		);
		if (response.status === 429) {
			// Rate limit exceeded
			error("purgeCacheByTags: Rate limit exceeded. Skipping cache purge.");
			return "rate-limit-exceeded";
		}
		const bodyResponse = (await response.json()) as {
			success: boolean;
			errors: Array<{ code: number; message: string }>;
		};
		if (!bodyResponse.success) {
			error(
				"purgeCacheByTags: Cache purge failed. Errors:",
				bodyResponse.errors.map((error) => `${error.code}: ${error.message}`)
			);
			return "purge-failed";
		}
		debugCache("purgeCacheByTags", "Cache purged successfully for tags:", tags);
		return "purge-success";
	} catch (error) {
		console.error("Error purging cache by tags:", error);
		return "purge-failed";
	} finally {
		// Cancel the stream when it has not been consumed
		try {
			await response?.body?.cancel();
		} catch {
			// Ignore errors when the stream was actually consumed
		}
	}
}
