import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	PREFIX_ENV_NAME as KV_CACHE_PREFIX_ENV_NAME,
} from "../../api/overrides/incremental-cache/kv-incremental-cache.js";
import {
	BINDING_NAME as R2_CACHE_BINDING_NAME,
	NAME as R2_CACHE_NAME,
	PREFIX_ENV_NAME as R2_CACHE_PREFIX_ENV_NAME,
} from "../../api/overrides/incremental-cache/r2-incremental-cache.js";
import {
	CACHE_DIR as STATIC_ASSETS_CACHE_DIR,
	NAME as STATIC_ASSETS_CACHE_NAME,
} from "../../api/overrides/incremental-cache/static-assets-incremental-cache.js";
import { computeCacheKey } from "../../api/overrides/internal.js";
import {
	BINDING_NAME as D1_TAG_BINDING_NAME,
	NAME as D1_TAG_NAME,
} from "../../api/overrides/tag-cache/d1-next-tag-cache.js";
import { normalizePath } from "../build/utils/normalize-path.js";
import type { WranglerTarget } from "../utils/run-wrangler.js";
import { runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta } from "./helpers.js";

async function resolveCacheName(
	value:
		| IncludedIncrementalCache
		| IncludedTagCache
		| LazyLoadedOverride<IncrementalCache>
		| LazyLoadedOverride<TagCache>
) {
	return typeof value === "function" ? (await value()).name : value;
}

export type CacheAsset = { isFetch: boolean; fullPath: string; key: string; buildId: string };

export function getCacheAssets(opts: BuildOptions): CacheAsset[] {
	const allFiles = globSync(path.join(opts.outputDir, "cache/**/*"), {
		withFileTypes: true,
		windowsPathsNoEscape: true,
	}).filter((f) => f.isFile());

	const assets: CacheAsset[] = [];

	for (const file of allFiles) {
		const fullPath = file.fullpath();
		const relativePath = normalizePath(path.relative(path.join(opts.outputDir, "cache"), fullPath));

		if (relativePath.startsWith("__fetch")) {
			const [__fetch, buildId, ...keyParts] = relativePath.split("/");

			if (__fetch !== "__fetch" || buildId === undefined || keyParts.length === 0) {
				throw new Error(`Invalid path for a Cache Asset file: ${relativePath}`);
			}

			assets.push({
				isFetch: true,
				fullPath,
				key: `/${keyParts.join("/")}`,
				buildId,
			});
		} else {
			const [buildId, ...keyParts] = relativePath.slice(0, -".cache".length).split("/");

			if (!relativePath.endsWith(".cache") || buildId === undefined || keyParts.length === 0) {
				throw new Error(`Invalid path for a Cache Asset file: ${relativePath}`);
			}

			assets.push({
				isFetch: false,
				fullPath,
				key: `/${keyParts.join("/")}`,
				buildId,
			});
		}
	}

	return assets;
}

async function populateR2IncrementalCache(
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

	const envVars = await getEnvFromPlatformProxy(populateCacheOptions);
	const prefix = envVars[R2_CACHE_PREFIX_ENV_NAME];

	const assets = getCacheAssets(options);

	for (const { fullPath, key, buildId, isFetch } of tqdm(assets)) {
		const cacheKey = computeCacheKey(key, {
			prefix,
			buildId,
			cacheType: isFetch ? "fetch" : "cache",
		});
		runWrangler(
			options,
			[
				"r2 object put",
				quoteShellMeta(normalizePath(path.join(bucket, cacheKey))),
				`--file ${quoteShellMeta(fullPath)}`,
			],
			// NOTE: R2 does not support the environment flag and results in the following error:
			// Incorrect type for the 'cacheExpiry' field on 'HttpMetadata': the provided value is not of type 'date'.
			{ target: populateCacheOptions.target, logging: "error" }
		);
	}
	logger.info(`Successfully populated cache with ${assets.length} assets`);
}

async function populateKVIncrementalCache(
	options: BuildOptions,
	populateCacheOptions: { target: WranglerTarget; environment?: string; cacheChunkSize?: number }
) {
	logger.info("\nPopulating KV incremental cache...");

	const config = unstable_readConfig({ env: populateCacheOptions.environment });

	const binding = config.kv_namespaces.find(({ binding }) => binding === KV_CACHE_BINDING_NAME);
	if (!binding) {
		throw new Error(`No KV binding ${JSON.stringify(KV_CACHE_BINDING_NAME)} found!`);
	}

	const envVars = await getEnvFromPlatformProxy(populateCacheOptions);
	const prefix = envVars[KV_CACHE_PREFIX_ENV_NAME];

	const assets = getCacheAssets(options);

	const chunkSize = Math.max(1, populateCacheOptions.cacheChunkSize ?? 25);
	const totalChunks = Math.ceil(assets.length / chunkSize);

	logger.info(`Inserting ${assets.length} assets to KV in chunks of ${chunkSize}`);

	for (const i of tqdm(Array.from({ length: totalChunks }, (_, i) => i))) {
		const chunkPath = path.join(options.outputDir, "cloudflare", `cache-chunk-${i}.json`);

		const kvMapping = assets
			.slice(i * chunkSize, (i + 1) * chunkSize)
			.map(({ fullPath, key, buildId, isFetch }) => ({
				key: computeCacheKey(key, {
					prefix,
					buildId,
					cacheType: isFetch ? "fetch" : "cache",
				}),
				value: readFileSync(fullPath, "utf8"),
			}));

		writeFileSync(chunkPath, JSON.stringify(kvMapping));

		runWrangler(options, ["kv bulk put", quoteShellMeta(chunkPath), `--binding ${KV_CACHE_BINDING_NAME}`], {
			...populateCacheOptions,
			logging: "error",
		});

		rmSync(chunkPath);
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
			D1_TAG_BINDING_NAME,
			`--command "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);"`,
		],
		{ ...populateCacheOptions, logging: "error" }
	);

	logger.info("\nSuccessfully created D1 table");
}

function populateStaticAssetsIncrementalCache(options: BuildOptions) {
	logger.info("\nPopulating Workers static assets...");

	cpSync(
		path.join(options.outputDir, "cache"),
		path.join(options.outputDir, "assets", STATIC_ASSETS_CACHE_DIR),
		{ recursive: true }
	);

	logger.info(`Successfully populated static assets cache`);
}

export async function populateCache(
	options: BuildOptions,
	config: OpenNextConfig,
	populateCacheOptions: { target: WranglerTarget; environment?: string; cacheChunkSize?: number }
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
				await populateR2IncrementalCache(options, populateCacheOptions);
				break;
			case KV_CACHE_NAME:
				await populateKVIncrementalCache(options, populateCacheOptions);
				break;
			case STATIC_ASSETS_CACHE_NAME:
				populateStaticAssetsIncrementalCache(options);
				break;
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
