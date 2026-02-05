import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

	const wranglerConfig = await readWranglerConfig(args);
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

	if (!fs.existsSync(buildOpts.outputDir)) {
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

	const baseCacheDir = path.join(opts.outputDir, "cache");
	const assets: CacheAsset[] = [];

	for (const file of allFiles) {
		const fullPath = file.fullpath();
		const relativePath = normalizePath(path.relative(baseCacheDir, fullPath));

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
	 * @default 25 for KV, 50 for R2
	 */
	cacheChunkSize?: number;
	/**
	 * Instructs Wrangler to use the preview namespace or ID defined in the Wrangler config for the remote target.
	 */
	shouldUsePreviewId: boolean;
};

/**
 * Resolves the path to the cache populate handler file.
 *
 * The handler is a standalone worker that wrangler dev can run directly.
 * It's located in the templates directory relative to this file.
 */
function getCachePopulateHandlerPath(): string {
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	return path.join(currentDir, "../templates/cache-populate-handler.js");
}

/**
 * Populates the R2 incremental cache using a local wrangler dev worker
 * with a remote R2 binding.
 *
 * This approach:
 * 1. Derives a temporary wrangler config from the project's config with the
 *    R2 cache binding set to `remote: true` (for remote targets).
 * 2. Starts a local worker via `wrangler dev` with a POST endpoint.
 * 3. Sends batched cache entries to the local worker.
 * 4. The worker writes entries to R2 using the binding (no API rate limits).
 *
 * This bypasses the Cloudflare API rate limit of 1,200 requests per 5 minutes
 * that affects `wrangler r2 bulk put`.
 */
async function populateR2IncrementalCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	logger.info("\nPopulating R2 incremental cache...");

	const binding = config.r2_buckets.find(
		({ binding }: { binding: string }) => binding === R2_CACHE_BINDING_NAME
	);
	if (!binding) {
		throw new Error(`No R2 binding ${JSON.stringify(R2_CACHE_BINDING_NAME)} found!`);
	}

	const prefix = envVars[R2_CACHE_PREFIX_ENV_NAME];
	const assets = getCacheAssets(buildOpts);

	if (assets.length === 0) {
		logger.info("No cache assets to populate");
		return;
	}

	const useRemote = populateCacheOptions.target === "remote";
	const handlerPath = getCachePopulateHandlerPath();

	// Create a temporary wrangler config derived from the project's config.
	// Only the R2 cache binding is propagated, with `remote` set appropriately.
	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "open-next-r2-populate-"));

	try {
		const tempWranglerConfig = {
			name: "open-next-cache-populate",
			main: handlerPath,
			compatibility_date: "2024-12-01",
			r2_buckets: [
				{
					binding: R2_CACHE_BINDING_NAME,
					bucket_name: binding.bucket_name,
					...(binding.jurisdiction && { jurisdiction: binding.jurisdiction }),
					...(useRemote && { remote: true }),
				},
			],
		};

		const configPath = path.join(tempDir, "wrangler.json");
		fs.writeFileSync(configPath, JSON.stringify(tempWranglerConfig, null, 2));

		// Start a local worker via wrangler dev
		const { url, stop } = await startWranglerDev(buildOpts, configPath);

		try {
			await sendCacheEntries(url, assets, prefix, populateCacheOptions.cacheChunkSize);
		} finally {
			stop();
		}
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}

	logger.info(`Successfully populated cache with ${assets.length} assets`);
}

/**
 * Starts `wrangler dev` with the given config and waits for it to be ready.
 *
 * @returns The local URL and a function to stop the worker.
 */
function startWranglerDev(
	buildOpts: BuildOptions,
	configPath: string
): Promise<{ url: string; stop: () => void }> {
	return new Promise((resolve, reject) => {
		const proc: ChildProcess = spawn(
			buildOpts.packager,
			[
				buildOpts.packager === "bun" ? "x" : "exec",
				"wrangler",
				"dev",
				"--config",
				configPath,
				"--port",
				"0",
			],
			{
				shell: true,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
				},
			}
		);

		let output = "";
		const timeout = setTimeout(() => {
			proc.kill();
			reject(new Error(`wrangler dev timed out waiting for ready signal.\nOutput:\n${output}`));
		}, 60_000);

		const onData = (data: Buffer) => {
			output += data.toString();
			const match = output.match(/http:\/\/(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d+)/);
			if (match?.[1]) {
				clearTimeout(timeout);
				const url = `http://localhost:${match[1]}`;
				resolve({
					url,
					stop: () => {
						proc.kill();
					},
				});
			}
		};

		proc.stdout?.on("data", onData);
		proc.stderr?.on("data", onData);

		proc.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});

		proc.on("exit", (code) => {
			clearTimeout(timeout);
			if (code !== 0 && code !== null) {
				reject(new Error(`wrangler dev exited with code ${code}\nOutput:\n${output}`));
			}
		});
	});
}

/**
 * Sends cache entries to the local populate worker in batches.
 */
async function sendCacheEntries(
	workerUrl: string,
	assets: CacheAsset[],
	prefix: string | undefined,
	cacheChunkSize?: number
): Promise<void> {
	const batchSize = Math.max(1, cacheChunkSize ?? 100);
	const totalBatches = Math.ceil(assets.length / batchSize);

	logger.info(`Populating ${assets.length} cache entries in batches of ${batchSize}`);

	let totalWritten = 0;
	let totalFailed = 0;

	for (const batchIndex of tqdm(Array.from({ length: totalBatches }, (_, i) => i))) {
		const batchAssets = assets.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

		const entries = batchAssets.map(({ fullPath, key, buildId, isFetch }) => ({
			key: computeCacheKey(key, {
				prefix,
				buildId,
				cacheType: isFetch ? "fetch" : "cache",
			}),
			value: fs.readFileSync(fullPath, "utf8"),
		}));

		const result = await sendBatchWithRetry(workerUrl, entries);

		totalWritten += result.written;
		totalFailed += result.failed;

		if (result.failed > 0 && result.errors) {
			logger.warn(
				`Batch ${batchIndex + 1} had ${result.failed} failures: ${result.errors.slice(0, 3).join(", ")}`
			);
		}
	}

	if (totalFailed > 0) {
		logger.warn(
			`Cache population completed with ${totalFailed} failures out of ${totalWritten + totalFailed} entries`
		);
	}
}

/**
 * Sends a batch of cache entries to the local worker with retry logic.
 */
async function sendBatchWithRetry(
	workerUrl: string,
	entries: { key: string; value: string }[],
	maxRetries = 3,
	retryDelayMs = 1000
): Promise<{ written: number; failed: number; errors?: string[] }> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (attempt > 0) {
			logger.info(`Retrying batch (attempt ${attempt + 1}/${maxRetries})...`);
			await sleep(retryDelayMs * Math.pow(2, attempt - 1));
		}

		try {
			const response = await fetch(workerUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ entries }),
			});

			if (!response.ok && response.status !== 207) {
				const text = await response.text().catch(() => "");
				throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
			}

			return (await response.json()) as { written: number; failed: number; errors?: string[] };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			logger.warn(`Batch failed: ${lastError.message}`);
		}
	}

	throw new Error(`Failed to populate batch after ${maxRetries} attempts: ${lastError?.message}`);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function populateKVIncrementalCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	logger.info("\nPopulating KV incremental cache...");

	const binding = config.kv_namespaces.find(
		({ binding }: { binding: string }) => binding === KV_CACHE_BINDING_NAME
	);
	if (!binding) {
		throw new Error(`No KV binding ${JSON.stringify(KV_CACHE_BINDING_NAME)} found!`);
	}

	const prefix = envVars[KV_CACHE_PREFIX_ENV_NAME];

	const assets = getCacheAssets(buildOpts);

	const chunkSize = Math.max(1, populateCacheOptions.cacheChunkSize ?? 25);
	const totalChunks = Math.ceil(assets.length / chunkSize);

	logger.info(`Inserting ${assets.length} assets to KV in chunks of ${chunkSize}`);

	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "open-next-"));

	for (const i of tqdm(Array.from({ length: totalChunks }, (_, i) => i))) {
		const chunkPath = path.join(tempDir, `cache-chunk-${i}.json`);

		const kvMapping = assets
			.slice(i * chunkSize, (i + 1) * chunkSize)
			.map(({ fullPath, key, buildId, isFetch }) => ({
				key: computeCacheKey(key, {
					prefix,
					buildId,
					cacheType: isFetch ? "fetch" : "cache",
				}),
				value: fs.readFileSync(fullPath, "utf8"),
			}));

		fs.writeFileSync(chunkPath, JSON.stringify(kvMapping));

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

		fs.rmSync(chunkPath, { force: true });
	}

	logger.info(`Successfully populated cache with ${assets.length} assets`);
}

function populateD1TagCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions
) {
	logger.info("\nCreating D1 table if necessary...");

	const binding = config.d1_databases.find(
		({ binding }: { binding: string }) => binding === D1_TAG_BINDING_NAME
	);
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

	fs.cpSync(
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
