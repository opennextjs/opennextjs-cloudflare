import { cpSync, existsSync, mkdirSync } from "node:fs";
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

import {
  BINDING_NAME as KV_CACHE_BINDING_NAME,
  NAME as KV_CACHE_NAME,
} from "../../api/overrides/incremental-cache/kv-incremental-cache.js";
import {
  BINDING_NAME as R2_CACHE_BINDING_NAME,
  DEFAULT_PREFIX as R2_CACHE_DEFAULT_PREFIX,
  NAME as R2_CACHE_NAME,
  PREFIX_ENV_NAME as R2_CACHE_PREFIX_ENV_NAME,
} from "../../api/overrides/incremental-cache/r2-incremental-cache.js";
import {
  CACHE_DIR as STATIC_ASSETS_CACHE_DIR,
  NAME as STATIC_ASSETS_CACHE_NAME,
} from "../../api/overrides/incremental-cache/static-assets-incremental-cache.js";
import {
  BINDING_NAME as D1_TAG_BINDING_NAME,
  NAME as D1_TAG_NAME,
} from "../../api/overrides/tag-cache/d1-next-tag-cache.js";
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

function populateR2IncrementalCache(
  options: BuildOptions,
  populateCacheOptions: { target: WranglerTarget; environment?: string }
) {
  logger.info("\nPopulating R2 incremental cache...");

  const config = unstable_readConfig({ env: populateCacheOptions.environment });

  const binding = config.r2_buckets.find(({ binding }) => binding === R2_CACHE_BINDING_NAME);
  if (!binding) {
    throw new Error(`No R2 binding ${JSON.stringify(R2_CACHE_BINDING_NAME)} found!`);
  }

  const bucket = binding.bucket_name;
  if (!bucket) {
    throw new Error(`R2 binding ${JSON.stringify(R2_CACHE_BINDING_NAME)} should have a 'bucket_name'`);
  }

  const assets = getCacheAssetPaths(options);
  for (const { fsPath, destPath } of tqdm(assets)) {
    const fullDestPath = path.join(
      bucket,
      process.env[R2_CACHE_PREFIX_ENV_NAME] ?? R2_CACHE_DEFAULT_PREFIX,
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
}

function populateKVIncrementalCache(
  options: BuildOptions,
  populateCacheOptions: { target: WranglerTarget; environment?: string }
) {
  logger.info("\nPopulating KV incremental cache...");

  const config = unstable_readConfig({ env: populateCacheOptions.environment });

  const binding = config.kv_namespaces.find(({ binding }) => binding === KV_CACHE_BINDING_NAME);
  if (!binding) {
    throw new Error(`No KV binding ${JSON.stringify(KV_CACHE_BINDING_NAME)} found!`);
  }

  const assets = getCacheAssetPaths(options);
  for (const { fsPath, destPath } of tqdm(assets)) {
    runWrangler(
      options,
      [
        "kv key put",
        JSON.stringify(destPath),
        `--binding ${JSON.stringify(KV_CACHE_BINDING_NAME)}`,
        `--path ${JSON.stringify(fsPath)}`,
      ],
      { ...populateCacheOptions, logging: "error" }
    );
  }
  logger.info(`Successfully populated cache with ${assets.length} assets`);
}

function populateD1TagCache(
  options: BuildOptions,
  populateCacheOptions: { target: WranglerTarget; environment?: string }
) {
  logger.info("\nCreating D1 table if necessary...");

  const config = unstable_readConfig({ env: populateCacheOptions.environment });

  const binding = config.d1_databases.find(({ binding }) => binding === D1_TAG_BINDING_NAME);
  if (!binding) {
    throw new Error(`No D1 binding ${JSON.stringify(D1_TAG_BINDING_NAME)} found!`);
  }

  runWrangler(
    options,
    [
      "d1 execute",
      JSON.stringify(D1_TAG_BINDING_NAME),
      `--command "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);"`,
    ],
    { ...populateCacheOptions, logging: "error" }
  );

  logger.info("\nSuccessfully created D1 table");
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
      case R2_CACHE_NAME:
        populateR2IncrementalCache(options, populateCacheOptions);
        break;
      case KV_CACHE_NAME:
        populateKVIncrementalCache(options, populateCacheOptions);
        break;
      case STATIC_ASSETS_CACHE_NAME: {
        logger.info("\nPopulating Workers static assets...");

        const assets = getCacheAssetPaths(options);
        for (const { fsPath, destPath } of tqdm(assets)) {
          const outputDestPath = path.join(options.outputDir, "assets", STATIC_ASSETS_CACHE_DIR, destPath);
          mkdirSync(path.dirname(outputDestPath), { recursive: true });
          cpSync(fsPath, outputDestPath);
        }
        logger.info(`Successfully populated static assets cache with ${assets.length} assets`);
        break;
      }
      default:
        logger.info("Incremental cache does not need populating");
    }
  }

  if (!config.dangerous?.disableTagCache && !config.dangerous?.disableIncrementalCache && tagCache) {
    const name = await resolveCacheName(tagCache);
    switch (name) {
      case D1_TAG_NAME:
        populateD1TagCache(options, populateCacheOptions);
        break;
      default:
        logger.info("Tag cache does not need populating");
    }
  }
}
