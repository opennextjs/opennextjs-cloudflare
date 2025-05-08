import type { CDNInvalidationHandler } from "@opennextjs/aws/types/overrides";

import { debugCache, purgeCacheByTags } from "../internal.js";

export default {
  name: "cloudflare",
  async invalidatePaths(paths) {
    const tags = paths.map((path) => `_N_T_${path.rawPath}`);
    debugCache("cdnInvalidation", "Invalidating paths:", tags);
    await purgeCacheByTags(tags);
    debugCache("cdnInvalidation", "Invalidated paths:", tags);
  }
} satisfies CDNInvalidationHandler;