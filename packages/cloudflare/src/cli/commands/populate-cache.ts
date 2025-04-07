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
import { tqdm } from "ts-tqdm";
import { unstable_readConfig } from "wrangler";

import { NAME as R2_CACHE_NAME } from "../../api/overrides/incremental-cache/r2-incremental-cache.js";
import { NAME as D1_TAG_NAME } from "../../api/overrides/tag-cache/d1-next-tag-cache.js";
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
  populateCacheOptions: { target: WranglerTarget; environment?: string }
) {
  const { incrementalCache, tagCache } = config.default.override ?? {};

  if (!existsSync(options.outputDir)) {
    logger.error("Unable to populate cache: Open Next build not found");
    process.exit(1);
  }

  if (!config.dangerous?.disableIncrementalCache && incrementalCache) {
    const name = await resolveCacheName(incrementalCache);
    switch (name) {
      case R2_CACHE_NAME: {
        const config = unstable_readConfig({ env: populateCacheOptions.environment });

        const binding = (config.r2_buckets ?? []).find(
          ({ binding }) => binding === "NEXT_INC_CACHE_R2_BUCKET"
        );

        if (!binding) {
          throw new Error("No R2 binding 'NEXT_INC_CACHE_R2_BUCKET' found!");
        }

        const bucket = binding.bucket_name;

        if (!bucket) {
          throw new Error("R2 binding 'NEXT_INC_CACHE_R2_BUCKET' should have a 'bucket_name'");
        }

        logger.info("\nPopulating R2 incremental cache...");

        const assets = getCacheAssetPaths(options);
        for (const { fsPath, destPath } of tqdm(assets)) {
          const fullDestPath = path.join(
            bucket,
            process.env.NEXT_INC_CACHE_R2_PREFIX ?? "incremental-cache",
            destPath
          );

          runWrangler(
            options,
            ["r2 object put", JSON.stringify(fullDestPath), `--file ${JSON.stringify(fsPath)}`],
            // NOTE: R2 does not support the environment flag and results in the following error:
            // Incorrect type for the 'cacheExpiry' field on 'HttpMetadata': the provided value is not of type 'date'.
            { target: populateCacheOptions.target, excludeRemoteFlag: true, logging: "error" }
          );
        }
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
      case D1_TAG_NAME: {
        logger.info("\nCreating D1 table if necessary...");

        runWrangler(
          options,
          [
            "d1 execute",
            "NEXT_TAG_CACHE_D1",
            `--command "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);"`,
          ],
          { ...populateCacheOptions, logging: "error" }
        );

        logger.info("\nSuccessfully created D1 table");
        break;
      }
      default:
        logger.info("Tag cache does not need populating");
    }
  }
}
