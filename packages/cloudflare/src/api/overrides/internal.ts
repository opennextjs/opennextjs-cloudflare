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

/** Outcome of a Cloudflare cache purge API request. */
export type PurgeCacheStatus =
	| "purge-success"
	| "missing-credentials"
	| "rate-limit-exceeded"
	| "purge-failed";

/** Outcome of a Cloudflare cache purge API request with a failure description. */
export type PurgeCacheResult =
	| { status: "purge-success" }
	| { status: Exclude<PurgeCacheStatus, "purge-success">; message: string };

/**
 * Requests a Cloudflare cache purge for the provided tags without logging failures.
 *
 * Callers are responsible for reporting failures, either by logging or by rejecting.
 *
 * @param env Cloudflare environment containing the zone ID and API token.
 * @param tags Cache tags to purge.
 * @returns The purge status and, on failure, a description of the error.
 */
export async function requestPurgeCacheByTags(env: CloudflareEnv, tags: string[]): Promise<PurgeCacheResult> {
	if (!env.CACHE_PURGE_ZONE_ID || !env.CACHE_PURGE_API_TOKEN) {
		return {
			status: "missing-credentials",
			message: "No cache zone ID or API token provided. Skipping cache purge.",
		};
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
			return { status: "rate-limit-exceeded", message: "purgeCacheByTags: Rate limit exceeded." };
		}
		const bodyResponse = (await response.json()) as {
			success: boolean;
			errors: Array<{ code: number; message: string }>;
		};
		if (!bodyResponse.success) {
			return {
				status: "purge-failed",
				message: `purgeCacheByTags: Cache purge failed. Errors: ${bodyResponse.errors
					.map((error) => `${error.code}: ${error.message}`)
					.join(", ")}`,
			};
		}
		debugCache("purgeCacheByTags", "Cache purged successfully for tags:", tags);
		return { status: "purge-success" };
	} catch (e) {
		return { status: "purge-failed", message: `Error purging cache by tags: ${e}` };
	} finally {
		// Cancel the stream when it has not been consumed
		try {
			await response?.body?.cancel();
		} catch {
			// Ignore errors when the stream was actually consumed
		}
	}
}

/**
 * Purges Cloudflare cache entries associated with the provided tags.
 *
 * This calls the Cloudflare cache purge API directly, logs failures, and reports the outcome as a status value.
 *
 * @param env Cloudflare environment containing the zone ID and API token.
 * @param tags Cache tags to purge.
 * @returns The purge outcome: success, missing credentials, rate limiting, or failure.
 */
export async function internalPurgeCacheByTags(
	env: CloudflareEnv,
	tags: string[]
): Promise<PurgeCacheStatus> {
	const result = await requestPurgeCacheByTags(env, tags);
	if (result.status !== "purge-success") {
		error(result.message);
	}
	return result.status;
}
