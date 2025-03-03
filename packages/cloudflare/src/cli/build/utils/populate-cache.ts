import { spawnSync } from "node:child_process";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type {
  IncludedIncrementalCache,
  IncludedTagCache,
  LazyLoadedOverride,
  OpenNextConfig,
} from "@opennextjs/aws/types/open-next.js";
import type { IncrementalCache, TagCache } from "@opennextjs/aws/types/overrides.js";

export type CacheBindingMode = "local" | "remote";

async function resolveCacheName(
  value:
    | IncludedIncrementalCache
    | IncludedTagCache
    | LazyLoadedOverride<IncrementalCache>
    | LazyLoadedOverride<TagCache>
) {
  return typeof value === "function" ? (await value()).name : value;
}

function runWrangler(opts: BuildOptions, mode: CacheBindingMode, args: string[]) {
  const result = spawnSync(
    opts.packager,
    ["exec", "wrangler", ...args, mode === "remote" && "--remote"].filter((v): v is string => !!v),
    {
      shell: true,
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  if (result.status !== 0) {
    logger.error("Failed to populate cache");
  } else {
    logger.info("Successfully populated cache");
  }
}

export async function populateCache(opts: BuildOptions, config: OpenNextConfig, mode: CacheBindingMode) {
  const { tagCache } = config.default.override ?? {};

  if (tagCache) {
    const name = await resolveCacheName(tagCache);
    switch (name) {
      case "d1-tag-cache": {
        logger.info("\nPopulating D1 tag cache...");

        runWrangler(opts, mode, [
          "d1 execute",
          "NEXT_CACHE_D1",
          `--file ${JSON.stringify(path.join(opts.outputDir, "cloudflare/cache-assets-manifest.sql"))}`,
        ]);
        break;
      }
    }
  }
}
