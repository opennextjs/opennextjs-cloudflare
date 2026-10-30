import { warn } from "@opennextjs/aws/adapters/logger.js";
import type { CDNInvalidationHandler } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, requestPurgeCacheByTags } from "../internal.js";

interface PurgeOptions {
	type: "durableObject" | "direct";
}

/**
 * Purges cache tags through the Cloudflare API and rejects unsuccessful outcomes.
 *
 * Failures are not logged here: the rejection carries the failure description so the
 * caller reports it once.
 *
 * @param env Cloudflare environment containing cache purge credentials.
 * @param tags Cache tags to purge.
 * @returns A promise that resolves after a successful purge.
 * @throws When credentials are missing, the request is rate limited, or the purge fails.
 */
async function purgeTagsDirectly(env: CloudflareEnv, tags: string[]): Promise<void> {
	const result = await requestPurgeCacheByTags(env, tags);
	if (result.status !== "purge-success") {
		throw new Error(`Cloudflare cache purge failed: ${result.status} - ${result.message}`);
	}
}

/**
 * Creates a Cloudflare CDN invalidation handler.
 *
 * In Durable Object mode, a missing `NEXT_CACHE_DO_PURGE` binding falls back to direct
 * invalidation and logs a warning once per handler.
 *
 * @param options Selects direct API or Durable Object invalidation.
 * @returns The Cloudflare CDN invalidation handler.
 */
export const purgeCache = ({ type = "direct" }: PurgeOptions) => {
	let hasWarnedMissingBinding = false;

	/**
	 * Invalidates cache entries associated with the provided tags.
	 *
	 * @param tags Cache tags to invalidate.
	 * @returns A promise that resolves when invalidation completes.
	 */
	const invalidateTags: NonNullable<CDNInvalidationHandler["invalidateTags"]> = async (tags) => {
		const { env } = getCloudflareContext();
		debugCache("cdnInvalidation", "Invalidating tags:", tags);
		if (type === "direct") {
			await purgeTagsDirectly(env, tags);
		} else {
			const durableObject = env.NEXT_CACHE_DO_PURGE;
			if (!durableObject) {
				if (!hasWarnedMissingBinding) {
					hasWarnedMissingBinding = true;
					warn(
						"Purge cache: NEXT_CACHE_DO_PURGE not found. Falling back to direct purges, which are not buffered and may be rate limited."
					);
				}
				await purgeTagsDirectly(env, tags);
			} else {
				const id = durableObject.idFromName("cache-purge");
				const obj = durableObject.get(id);
				await obj.purgeCacheByTags(tags);
			}
		}
		debugCache("cdnInvalidation", "Invalidated tags:", tags);
	};

	return {
		name: "cloudflare",
		/**
		 * Invalidates cache entries associated with resolved paths.
		 *
		 * @param paths Paths whose cache entries should be invalidated.
		 * @returns A promise that resolves when invalidation completes.
		 */
		async invalidatePaths(paths) {
			const tags = paths.map((path) => `_N_T_${path.rawPath}`);
			await invalidateTags(tags);
		},
		invalidateTags,
	} satisfies CDNInvalidationHandler;
};

export default purgeCache;
