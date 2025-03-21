import { existsSync } from "node:fs";
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
import { globSync } from "glob";

import type { WranglerTarget } from "../utils/run-wrangler.js";
import { runWrangler } from "../utils/run-wrangler.js";

async function resolveCacheName(
  value:
    | IncludedIncrementalCache
    | IncludedTagCache
    | LazyLoadedOverride<IncrementalCache>
    | LazyLoadedOverride<TagCache>
) {
  return typeof value === "function" ? (await value()).name : value;
}

function getCacheAssetPaths(opts: BuildOptions) {
  return globSync(path.join(opts.outputDir, "cache/**/*"), {
    withFileTypes: true,
    windowsPathsNoEscape: true,
  })
    .filter((f) => f.isFile())
    .map((f) => {
      const relativePath = path.relative(path.join(opts.outputDir, "cache"), f.fullpathPosix());

      return {
        fsPath: f.fullpathPosix(),
        destPath: relativePath.startsWith("__fetch")
          ? `${relativePath.replace("__fetch/", "")}.fetch`
          : relativePath,
      };
    });
}

export async function populateCache(
  options: BuildOptions,
  config: OpenNextConfig,
  populateCacheOptions: { target: WranglerTarget }
) {
  const { incrementalCache, tagCache } = config.default.override ?? {};

  if (!existsSync(options.outputDir)) {
    logger.error("Unable to populate cache: Open Next build not found");
    process.exit(1);
  }

  if (!config.dangerous?.disableIncrementalCache && incrementalCache) {
    const name = await resolveCacheName(incrementalCache);
    switch (name) {
      case "r2-incremental-cache": {
        logger.info("\nPopulating R2 incremental cache...");

        const assets = getCacheAssetPaths(options);
        assets.forEach(({ fsPath, destPath }) => {
          const fullDestPath = path.join(
            "NEXT_CACHE_R2_BUCKET",
            process.env.NEXT_CACHE_R2_PREFIX ?? "incremental-cache",
            destPath
          );

          runWrangler(
            options,
            ["r2 object put", JSON.stringify(fullDestPath), `--file ${JSON.stringify(fsPath)}`],
            { ...populateCacheOptions, excludeRemoteFlag: true, logging: "error" }
          );
        });
        logger.info(`Successfully populated cache with ${assets.length} assets`);
        break;
      }
      default:
        logger.info("Incremental cache does not need populating");
    }
  }

  if (!config.dangerous?.disableTagCache && !config.dangerous?.disableIncrementalCache && tagCache) {
    const name = await resolveCacheName(tagCache);
    switch (name) {
      case "d1-next-mode-tag-cache": {
        logger.info("\nCreating D1 table if necessary...");
        const revalidationsTable = process.env.NEXT_CACHE_D1_REVALIDATIONS_TABLE || "revalidations";

        runWrangler(
          options,
          [
            "d1 execute",
            "NEXT_CACHE_D1",
            `--command "CREATE TABLE IF NOT EXISTS ${JSON.stringify(revalidationsTable)} (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);"`,
          ],
          { ...populateCacheOptions, logging: "error" }
        );

        logger.info("\nSuccessfully created D1 table");
        break;
      }
      case "d1-tag-cache": {
        logger.info("\nPopulating D1 tag cache...");

        runWrangler(
          options,
          [
            "d1 execute",
            "NEXT_CACHE_D1",
            `--file ${JSON.stringify(path.join(options.outputDir, "cloudflare/cache-assets-manifest.sql"))}`,
          ],
          { ...populateCacheOptions, logging: "error" }
        );
        logger.info("Successfully populated cache");
        break;
      }
      default:
        logger.info("Tag cache does not need populating");
    }
  }
}
