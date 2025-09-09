import { error } from "@opennextjs/aws/adapters/logger.js";
import type { CDNInvalidationHandler } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, internalPurgeCacheByTags } from "../internal.js";

interface PurgeOptions {
	type: "durableObject" | "direct";
}

export const purgeCache = ({ type = "direct" }: PurgeOptions) => {
	return {
		name: "cloudflare",
		async invalidatePaths(paths) {
			const { env } = getCloudflareContext();
			const tags = paths.map((path) => `_N_T_${path.rawPath}`);
			debugCache("cdnInvalidation", "Invalidating paths:", tags);
			if (type === "direct") {
				await internalPurgeCacheByTags(env, tags);
			} else {
				const durableObject = env.NEXT_CACHE_DO_PURGE;
				if (!durableObject) {
					error("Purge cache: NEXT_CACHE_DO_PURGE not found. Skipping cache purge.");
					return;
				}
				const id = durableObject.idFromName("cache-purge");
				const obj = durableObject.get(id);
				await obj.purgeCacheByTags(tags);
			}
			debugCache("cdnInvalidation", "Invalidated paths:", tags);
		},
	} satisfies CDNInvalidationHandler;
};

export default purgeCache;
