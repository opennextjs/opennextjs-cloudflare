import { spawnSync } from "node:child_process";
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

function runWrangler(
  opts: BuildOptions,
  wranglerOpts: { mode: CacheBindingMode; excludeRemoteFlag?: boolean },
  args: string[]
) {
  const result = spawnSync(
    opts.packager,
    [
      "exec",
      "wrangler",
      ...args,
      wranglerOpts.mode === "remote" && !wranglerOpts.excludeRemoteFlag && "--remote",
      wranglerOpts.mode === "local" && "--local",
    ].filter((v): v is string => !!v),
    {
      shell: true,
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  if (result.status !== 0) {
    logger.error("Failed to populate cache");
    process.exit(1);
  }
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

export async function populateCache(opts: BuildOptions, config: OpenNextConfig, mode: CacheBindingMode) {
  const { incrementalCache, tagCache } = config.default.override ?? {};

  if (!existsSync(opts.outputDir)) {
    logger.error("Unable to populate cache: Open Next build not found");
    process.exit(1);
  }

  if (!config.dangerous?.disableIncrementalCache && incrementalCache) {
    const name = await resolveCacheName(incrementalCache);
    switch (name) {
      case "r2-incremental-cache": {
        logger.info("\nPopulating R2 incremental cache...");

        const assets = getCacheAssetPaths(opts);
        assets.forEach(({ fsPath, destPath }) => {
          const fullDestPath = path.join(
            "NEXT_CACHE_R2_BUCKET",
            process.env.NEXT_CACHE_R2_PREFIX ?? "incremental-cache",
            destPath
          );

          runWrangler(opts, { mode, excludeRemoteFlag: true }, [
            "r2 object put",
            JSON.stringify(fullDestPath),
            `--file ${JSON.stringify(fsPath)}`,
          ]);
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
      case "d1-tag-cache": {
        logger.info("\nPopulating D1 tag cache...");

        runWrangler(opts, { mode }, [
          "d1 execute",
          "NEXT_CACHE_D1",
          `--file ${JSON.stringify(path.join(opts.outputDir, "cloudflare/cache-assets-manifest.sql"))}`,
        ]);
        logger.info("Successfully populated cache");
        break;
      }
      default:
        logger.info("Tag cache does not need populating");
    }
  }
}

export function isCacheBindingMode(v: string | undefined): v is CacheBindingMode {
  return !!v && ["local", "remote"].includes(v);
}
