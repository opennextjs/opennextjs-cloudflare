import { createHash } from "node:crypto";

import { error } from "@opennextjs/aws/adapters/logger.js";
import type { CacheEntryType, CacheValue } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../cloudflare-context.js";

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

export async function purgeCacheByTags(tags: string[]) {
	const { env } = getCloudflareContext();
	// We have a durable object for purging cache
	// We should use it
	if (env.NEXT_CACHE_DO_PURGE) {
		const durableObject = env.NEXT_CACHE_DO_PURGE;
		const id = durableObject.idFromName("cache-purge");
		const obj = durableObject.get(id);
		await obj.purgeCacheByTags(tags);
	} else {
		// We don't have a durable object for purging cache
		// We should use the API directly
		await internalPurgeCacheByTags(env, tags);
	}
}

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
