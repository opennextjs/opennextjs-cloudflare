import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
import rclone from "rclone.js";
import { tqdm } from "ts-tqdm";
import type { Unstable_Config as WranglerConfig } from "wrangler";
import type yargs from "yargs";

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
import { getEnvFromPlatformProxy, quoteShellMeta, type WorkerEnvVar } from "./helpers.js";
import type { WithWranglerArgs } from "./utils.js";
import {
	getNormalizedOptions,
	printHeaders,
	readWranglerConfig,
	retrieveCompiledConfig,
	withWranglerOptions,
	withWranglerPassthroughArgs,
} from "./utils.js";

/**
 * Implementation of the `opennextjs-cloudflare populateCache` command.
 *
 * @param args
 */
async function populateCacheCommand(
	target: "local" | "remote",
	args: WithWranglerArgs<{ cacheChunkSize?: number }>
) {
	printHeaders(`populate cache - ${target}`);

	const { config } = await retrieveCompiledConfig();
	const buildOpts = getNormalizedOptions(config);

	const wranglerConfig = readWranglerConfig(args);
	const envVars = await getEnvFromPlatformProxy(config, buildOpts);

	await populateCache(
		buildOpts,
		config,
		wranglerConfig,
		{
			target,
			environment: args.env,
			wranglerConfigPath: args.wranglerConfigPath,
			cacheChunkSize: args.cacheChunkSize,
			shouldUsePreviewId: false,
		},
		envVars
	);
}

export async function populateCache(
	buildOpts: BuildOptions,
	config: OpenNextConfig,
	wranglerConfig: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	const { incrementalCache, tagCache } = config.default.override ?? {};

	if (!existsSync(buildOpts.outputDir)) {
		logger.error("Unable to populate cache: Open Next build not found");
		process.exit(1);
	}

	if (!config.dangerous?.disableIncrementalCache && incrementalCache) {
		const name = await resolveCacheName(incrementalCache);
		switch (name) {
			case R2_CACHE_NAME:
				await populateR2IncrementalCache(buildOpts, wranglerConfig, populateCacheOptions, envVars);
				break;
			case KV_CACHE_NAME:
				await populateKVIncrementalCache(buildOpts, wranglerConfig, populateCacheOptions, envVars);
				break;
			case STATIC_ASSETS_CACHE_NAME:
				populateStaticAssetsIncrementalCache(buildOpts);
				break;
			default:
				logger.info("Incremental cache does not need populating");
		}
	}

	if (!config.dangerous?.disableTagCache && !config.dangerous?.disableIncrementalCache && tagCache) {
		const name = await resolveCacheName(tagCache);
		switch (name) {
			case D1_TAG_NAME:
				populateD1TagCache(buildOpts, wranglerConfig, populateCacheOptions);
				break;
			default:
				logger.info("Tag cache does not need populating");
		}
	}
}

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

type PopulateCacheOptions = {
	/**
	 * Whether to populate the local or remote cache.
	 */
	target: WranglerTarget;
	/**
	 * Wrangler environment to use.
	 */
	environment?: string;
	/**
	 * Path to the Wrangler config file.
	 */
	wranglerConfigPath?: string;
	/**
	 * Chunk sizes to use when populating KV cache. Ignored for R2.
	 *
	 * @default 25 for KV
	 */
	cacheChunkSize?: number;
	/**
	 * Instructs Wrangler to use the preview namespace or ID defined in the Wrangler config for the remote target.
	 */
	shouldUsePreviewId: boolean;
};

/**
 * Create a temporary configuration file for batch upload from environment variables
 * @returns Path to the temporary config file or null if env vars not available
 */
function createTempRcloneConfig(accessKey: string, secretKey: string, accountId: string): string | null {
	const tempDir = tmpdir();
	const tempConfigPath = path.join(tempDir, `rclone-config-${Date.now()}.conf`);

	const configContent = `[r2]
type = s3
provider = Cloudflare
access_key_id = ${accessKey}
secret_access_key = ${secretKey}
endpoint = https://${accountId}.r2.cloudflarestorage.com
acl = private
`;

	/**
	 * 0o600 is an octal number (the 0o prefix indicates octal in JavaScript)
	 * that represents Unix file permissions:
	 *
	 * - 6 (owner): read (4) + write (2) = readable and writable by the file owner
	 * - 0 (group): no permissions for the group
	 * - 0 (others): no permissions for anyone else
	 *
	 * In symbolic notation, this is: rw-------
	 */
	writeFileSync(tempConfigPath, configContent, { mode: 0o600 });
	return tempConfigPath;
}

/**
 * Populate R2 incremental cache using batch upload for better performance
 * Uses parallel transfers to significantly speed up cache population
 */
async function populateR2IncrementalCacheWithBatchUpload(
	bucket: string,
	prefix: string | undefined,
	assets: CacheAsset[],
	envVars: WorkerEnvVar
) {
	const accessKey = envVars.R2_ACCESS_KEY_ID || null;
	const secretKey = envVars.R2_SECRET_ACCESS_KEY || null;
	const accountId = envVars.CF_ACCOUNT_ID || null;

	// Ensure all required env vars are set correctly
	if (!accessKey || !secretKey || !accountId) {
		throw new Error(
			"Please set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and CF_ACCOUNT_ID environment variables to enable faster batch upload for remote R2."
		);
	}

	logger.info("\nPopulating remote R2 incremental cache using batch upload...");

	// Create temporary config from env vars - required for batch upload
	const tempConfigPath = createTempRcloneConfig(accessKey, secretKey, accountId);
	if (!tempConfigPath) {
		throw new Error("Failed to create temporary rclone config for R2 batch upload.");
	}

	const env = {
		...process.env,
		RCLONE_CONFIG: tempConfigPath,
	};

	logger.info("Using batch upload with R2 credentials from environment variables");

	// Create a staging dir in temp directory with proper key paths
	const tempDir = tmpdir();
	const stagingDir = path.join(tempDir, `.r2-staging-${Date.now()}`);

	// Track success to ensure cleanup happens correctly
	let success = null;

	try {
		mkdirSync(stagingDir, { recursive: true });

		for (const { fullPath, key, buildId, isFetch } of assets) {
			const cacheKey = computeCacheKey(key, {
				prefix,
				buildId,
				cacheType: isFetch ? "fetch" : "cache",
			});
			const destPath = path.join(stagingDir, cacheKey);
			mkdirSync(path.dirname(destPath), { recursive: true });
			copyFileSync(fullPath, destPath);
		}

		// Use rclone.js to sync the R2
		const remote = `r2:${bucket}`;

		// Using rclone.js Promise-based API for the copy operation
		await rclone.promises.copy(stagingDir, remote, {
			progress: true,
			transfers: 16,
			checkers: 8,
			env,
		});

		logger.info(`Successfully uploaded ${assets.length} assets to R2 using batch upload`);
		success = true;
	} finally {
		try {
			// Cleanup temporary staging directory
			rmSync(stagingDir, { recursive: true, force: true });
		} catch {
			console.warn(`Failed to remove temporary staging directory at ${stagingDir}`);
		}

		try {
			// Cleanup temporary config file
			rmSync(tempConfigPath);
		} catch {
			console.warn(`Failed to remove temporary config at ${tempConfigPath}`);
		}
	}

	if (!success) {
		throw new Error("R2 batch upload failed, falling back to sequential uploads...");
	}
}

/**
 * Populate R2 incremental cache using sequential Wrangler uploads
 * Falls back to this method when batch upload is not available or fails
 */
async function populateR2IncrementalCacheWithSequentialUpload(
	buildOpts: BuildOptions,
	bucket: string,
	prefix: string | undefined,
	assets: CacheAsset[],
	populateCacheOptions: PopulateCacheOptions
) {
	logger.info("Using sequential cache uploads.");

	for (const { fullPath, key, buildId, isFetch } of tqdm(assets)) {
		const cacheKey = computeCacheKey(key, {
			prefix,
			buildId,
			cacheType: isFetch ? "fetch" : "cache",
		});
		runWrangler(
			buildOpts,
			[
				"r2 object put",
				quoteShellMeta(normalizePath(path.join(bucket, cacheKey))),
				`--file ${quoteShellMeta(fullPath)}`,
			],
			{
				target: populateCacheOptions.target,
				configPath: populateCacheOptions.wranglerConfigPath,
				// R2 does not support the environment flag and results in the following error:
				// Incorrect type for the 'cacheExpiry' field on 'HttpMetadata': the provided value is not of type 'date'.
				environment: undefined,
				logging: "error",
			}
		);
	}
	logger.info(`Successfully populated cache with ${assets.length} assets`);
}

async function populateR2IncrementalCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	logger.info("\nPopulating R2 incremental cache...");

	const binding = config.r2_buckets.find(({ binding }) => binding === R2_CACHE_BINDING_NAME);
	if (!binding) {
		throw new Error(`No R2 binding ${JSON.stringify(R2_CACHE_BINDING_NAME)} found!`);
	}

	const bucket = binding.bucket_name;
	if (!bucket) {
		throw new Error(`R2 binding ${JSON.stringify(R2_CACHE_BINDING_NAME)} should have a 'bucket_name'`);
	}

	const prefix = envVars[R2_CACHE_PREFIX_ENV_NAME];

	const assets = getCacheAssets(buildOpts);

	// Force sequential upload for local target
	if (populateCacheOptions.target === "local") {
		logger.info("Using sequential upload for local R2 (batch upload only works with remote R2)");
		return await populateR2IncrementalCacheWithSequentialUpload(
			buildOpts,
			bucket,
			prefix,
			assets,
			populateCacheOptions
		);
	}

	try {
		// Attempt batch upload first (using rclone) - only for remote target
		return await populateR2IncrementalCacheWithBatchUpload(bucket, prefix, assets, envVars);
	} catch (error) {
		logger.warn(`Batch upload failed: ${error instanceof Error ? error.message : error}`);
		logger.info("Falling back to sequential uploads...");

		// Sequential upload fallback (using Wrangler)
		return await populateR2IncrementalCacheWithSequentialUpload(
			buildOpts,
			bucket,
			prefix,
			assets,
			populateCacheOptions
		);
	}
}

async function populateKVIncrementalCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	logger.info("\nPopulating KV incremental cache...");

	const binding = config.kv_namespaces.find(({ binding }) => binding === KV_CACHE_BINDING_NAME);
	if (!binding) {
		throw new Error(`No KV binding ${JSON.stringify(KV_CACHE_BINDING_NAME)} found!`);
	}

	const prefix = envVars[KV_CACHE_PREFIX_ENV_NAME];

	const assets = getCacheAssets(buildOpts);

	const chunkSize = Math.max(1, populateCacheOptions.cacheChunkSize ?? 25);
	const totalChunks = Math.ceil(assets.length / chunkSize);

	logger.info(`Inserting ${assets.length} assets to KV in chunks of ${chunkSize}`);

	for (const i of tqdm(Array.from({ length: totalChunks }, (_, i) => i))) {
		const chunkPath = path.join(buildOpts.outputDir, "cloudflare", `cache-chunk-${i}.json`);

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

		runWrangler(
			buildOpts,
			[
				"kv bulk put",
				quoteShellMeta(chunkPath),
				`--binding ${KV_CACHE_BINDING_NAME}`,
				`--preview ${populateCacheOptions.shouldUsePreviewId}`,
			],
			{
				target: populateCacheOptions.target,
				environment: populateCacheOptions.environment,
				configPath: populateCacheOptions.wranglerConfigPath,
				logging: "error",
			}
		);

		rmSync(chunkPath);
	}

	logger.info(`Successfully populated cache with ${assets.length} assets`);
}

function populateD1TagCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions
) {
	logger.info("\nCreating D1 table if necessary...");

	const binding = config.d1_databases.find(({ binding }) => binding === D1_TAG_BINDING_NAME);
	if (!binding) {
		throw new Error(`No D1 binding ${JSON.stringify(D1_TAG_BINDING_NAME)} found!`);
	}

	runWrangler(
		buildOpts,
		[
			"d1 execute",
			D1_TAG_BINDING_NAME,
			`--command "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);"`,
			`--preview ${populateCacheOptions.shouldUsePreviewId}`,
		],
		{
			target: populateCacheOptions.target,
			environment: populateCacheOptions.environment,
			configPath: populateCacheOptions.wranglerConfigPath,
			logging: "error",
		}
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

/**
 * Add the `populateCache` command to yargs configuration, with nested commands for `local` and `remote`.
 *
 * Consumes 2 positional parameters.
 */
export function addPopulateCacheCommand<T extends yargs.Argv>(y: T) {
	return y.command("populateCache", "Populate the cache for a built Next.js app", (c) =>
		c
			.command(
				"local",
				"Local dev server cache",
				(c) => withPopulateCacheOptions(c),
				(args) => populateCacheCommand("local", withWranglerPassthroughArgs(args))
			)
			.command(
				"remote",
				"Remote Cloudflare Worker cache",
				(c) => withPopulateCacheOptions(c),
				(args) => populateCacheCommand("remote", withWranglerPassthroughArgs(args))
			)
			.demandCommand(1, 1)
	);
}

export function withPopulateCacheOptions<T extends yargs.Argv>(args: T) {
	return withWranglerOptions(args).options("cacheChunkSize", {
		type: "number",
		desc: "Number of entries per chunk when populating the cache",
	});
}
