import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { setTimeout } from "node:timers/promises";
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
import { tqdm } from "ts-tqdm";
import type { Unstable_Config as WranglerConfig } from "wrangler";
import { unstable_startWorker } from "wrangler";
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
import { ensureR2Bucket } from "../utils/ensure-r2-bucket.js";
import { normalizePath } from "../utils/normalize-path.js";
import type { R2Response } from "../workers/r2-cache-types.js";
import { getEnvFromPlatformProxy, quoteShellMeta, type WorkerEnvVar } from "./utils/helpers.js";
import type { WranglerTarget } from "./utils/run-wrangler.js";
import { runWrangler } from "./utils/run-wrangler.js";
import type { WithWranglerArgs } from "./utils/utils.js";
import {
	getNormalizedOptions,
	printHeaders,
	readWranglerConfig,
	retrieveCompiledConfig,
	withWranglerOptions,
	withWranglerPassthroughArgs,
} from "./utils/utils.js";

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
	const envVars = await getEnvFromPlatformProxy(
		{
			configPath: args.wranglerConfigPath,
			environment: args.env,
		},
		buildOpts
	);

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
		throw new Error("Unable to populate cache: Open Next build not found");
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

export async function getCacheAssets(opts: BuildOptions): Promise<CacheAsset[]> {
	const baseCacheDir = path.join(opts.outputDir, "cache");
	const assets: CacheAsset[] = [];

	for await (const file of fsp.glob("**/*", { cwd: baseCacheDir, withFileTypes: true })) {
		if (!file.isFile()) {
			continue;
		}

		const fullPath = path.join(file.parentPath, file.name);
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

export type PopulateCacheOptions = {
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
	 * Number of concurrent requests when populating the cache.
	 * For KV this is the chunk size passed to `wrangler kv bulk put`.
	 * For R2 this is the number of concurrent requests to the local worker.
	 *
	 * @default 25
	 */
	cacheChunkSize?: number;
	/**
	 * Instructs Wrangler to use the preview namespace or ID defined in the Wrangler config for the remote target.
	 */
	shouldUsePreviewId: boolean;
};

/**
 * Populates the R2 incremental cache by starting a worker with an R2 binding.
 *
 * Flow:
 * 1. Reads the R2 binding configuration from the wrangler config.
 * 2. Collects cache assets from the build output.
 * 3. Starts a worker (via `unstable_startWorker`) with the R2 binding, set to run remotely or locally depending upon the cache target.
 * 4. Sends individual POST requests to the worker.
 *
 * Using a binding bypasses the Cloudflare REST API rate limit that affects `wrangler r2 bulk put`.
 */
async function populateR2IncrementalCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	logger.info(`\nPopulating ${populateCacheOptions.target} R2 incremental cache...`);

	const binding = config.r2_buckets.find(({ binding }) => binding === R2_CACHE_BINDING_NAME);
	if (!binding) {
		throw new Error(`No R2 binding "${R2_CACHE_BINDING_NAME}" found!`);
	}

	if (typeof binding.bucket_name !== "string") {
		throw new Error(`R2 binding "${R2_CACHE_BINDING_NAME}" is missing a bucket_name.`);
	}

	const bucketName =
		populateCacheOptions.shouldUsePreviewId && typeof binding.preview_bucket_name === "string"
			? binding.preview_bucket_name
			: binding.bucket_name;
	const prefix = envVars[R2_CACHE_PREFIX_ENV_NAME];
	const assets = await getCacheAssets(buildOpts);

	if (assets.length === 0) {
		logger.info("No cache assets to populate");
		return;
	}

	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const handlerPath = path.join(currentDir, "../workers/r2-cache.js");
	const isRemote = populateCacheOptions.target === "remote";

	if (isRemote) {
		const result = await ensureR2Bucket(buildOpts.appPath, bucketName, binding.jurisdiction);

		if (!result.success) {
			throw new Error(
				`Failed to provision remote R2 bucket "${bucketName}" for binding "${R2_CACHE_BINDING_NAME}": ${result.error}`
			);
		}
	}

	// Start a local worker and proxy it to the Cloudflare network when remote mode is enabled.
	const worker = await unstable_startWorker({
		name: "open-next-cache-populate",
		// Prevent it from discovering the project's wrangler config and leaking unrelated bindings.
		config: "",
		entrypoint: handlerPath,
		compatibilityDate: "2026-01-01",
		bindings: {
			R2: {
				type: "r2_bucket",
				bucket_name: bucketName,
				jurisdiction: binding.jurisdiction,
			},
		},
		dev: {
			remote: isRemote,
			server: { port: 0 },
			inspector: false,
			watch: false,
			liveReload: false,
			logLevel: "none",
		},
	});

	try {
		const baseUrl = await worker.url;
		await sendEntriesToR2Worker({
			workerUrl: new URL("/populate", baseUrl).href,
			assets,
			prefix,
			maxConcurrency: Math.max(1, populateCacheOptions.cacheChunkSize ?? 25),
		});
	} catch (e) {
		if (isRemote) {
			throw new Error(
				`Failed to populate remote R2 bucket "${bucketName}" for binding "${R2_CACHE_BINDING_NAME}": ${e instanceof Error ? e.message : String(e)}`
			);
		} else {
			throw new Error(`Failed to populate the local R2 cache: ${e instanceof Error ? e.message : String(e)}`);
		}
	} finally {
		await worker.dispose();
	}

	logger.info(`Successfully populated cache with ${assets.length} entries`);
}

/**
 * Sends cache entries to the R2 worker, one entry per request.
 *
 * Up to `concurrency` requests are in-flight at any given time.
 * Retry logic for transient R2 write failures is handled by the worker.
 *
 * @param options
 * @param options.workerUrl - The URL of the local R2 worker's `/populate` endpoint.
 * @param options.assets - The cache assets to write, as collected by {@link getCacheAssets}.
 * @param options.prefix - Optional prefix prepended to each R2 key.
 * @param options.concurrency - Maximum number of concurrent in-flight requests.
 * @returns Resolves when all entries have been written successfully.
 * @throws {Error} If any entry fails after all retries or encounters a non-retryable error.
 */
async function sendEntriesToR2Worker(options: {
	workerUrl: string;
	assets: CacheAsset[];
	prefix: string | undefined;
	maxConcurrency: number;
}): Promise<void> {
	const { workerUrl, assets, prefix, maxConcurrency } = options;

	// Build the list of entries to send (key + filename).
	// File contents are read lazily in sendEntryToR2Worker to avoid
	// loading all cache values into memory at once.
	const entries = assets.map(({ fullPath, key, buildId, isFetch }) => ({
		key: computeCacheKey(key, {
			prefix,
			buildId,
			cacheType: isFetch ? "fetch" : "cache",
		}),
		filename: fullPath,
	}));

	// Use a concurrency-limited loop with a progress bar.
	// `pending` tracks in-flight promises so we can cap concurrency.
	const pending = new Set<Promise<void>>();

	let concurrency = 1;

	for (const entry of tqdm(entries)) {
		const task = sendEntryToR2Worker({
			workerUrl,
			key: entry.key,
			filename: entry.filename,
		}).finally(() => pending.delete(task));

		pending.add(task);

		// If we've reached the concurrency limit, wait for one to finish.
		if (pending.size >= concurrency) {
			await Promise.race(pending);
			// Increase concurrency gradually to avoid overwhelming the worker
			// with too many requests at once.
			if (concurrency < maxConcurrency) {
				concurrency++;
			}
		}
	}

	await Promise.all(pending);
}

class RetryableWorkerError extends Error {}

/**
 * Sends a single cache entry to the R2 worker.
 *
 * The file is streamed from disk and sent as the raw request body.
 *
 * @param options
 * @param options.workerUrl - The URL of the local R2 worker's `/populate` endpoint.
 * @param options.key - The R2 object key.
 * @param options.filename - Path to the cache file on disk. Read at send time to avoid holding all values in memory.
 * @throws {Error} If the worker reports a failure.
 */
async function sendEntryToR2Worker(options: {
	workerUrl: string;
	key: string;
	filename: string;
}): Promise<void> {
	const { workerUrl, key, filename } = options;

	const CLIENT_RETRY_ATTEMPTS = 5;
	const CLIENT_RETRY_BASE_DELAY_MS = 250;

	for (let attempt = 0; attempt < CLIENT_RETRY_ATTEMPTS; attempt++) {
		try {
			let response: Response;

			try {
				response = await fetch(workerUrl, {
					method: "POST",
					headers: {
						"x-opennext-cache-key": key,
						"content-length": fs.statSync(filename).size.toString(),
					},
					body: Readable.toWeb(fs.createReadStream(filename)) as unknown as ReadableStream,
					signal: AbortSignal.timeout(60_000),
					// @ts-expect-error - `duplex` is required for streaming request bodies in Node.js
					duplex: "half",
				});
			} catch (e) {
				throw new RetryableWorkerError(
					`Failed to send request to R2 worker: ${e instanceof Error ? e.message : String(e)}`,
					{
						cause: e,
					}
				);
			}

			const body = await response.text();
			let result: R2Response;

			try {
				result = JSON.parse(body) as R2Response;
			} catch (e) {
				if (body.includes("Worker exceeded resource limits")) {
					throw new RetryableWorkerError("Worker exceeded resource limits", { cause: e });
				}

				if (response.status >= 500) {
					throw new RetryableWorkerError(
						`Worker returned a ${response.status} ${response.statusText} response`,
						{ cause: e }
					);
				}

				throw new Error(`Unexpected ${response.status} response from R2 worker: ${body}`, {
					cause: e,
				});
			}

			if (!result.success && response.status >= 500) {
				throw new RetryableWorkerError(result.error);
			}

			if (!result.success) {
				throw new Error(`Failed to write "${key}" to R2: ${result.error}`);
			}

			return;
		} catch (e) {
			if (e instanceof RetryableWorkerError && attempt < CLIENT_RETRY_ATTEMPTS - 1) {
				logger.error(
					`Attempt ${attempt + 1} to write "${key}" failed with a retryable error: ${e.message}. Retrying...`
				);
				await setTimeout(CLIENT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
				continue;
			}

			throw new Error(`Failed to write "${key}" to R2 after ${CLIENT_RETRY_ATTEMPTS} attempts`, {
				cause: e,
			});
		}
	}
}

async function populateKVIncrementalCache(
	buildOpts: BuildOptions,
	config: WranglerConfig,
	populateCacheOptions: PopulateCacheOptions,
	envVars: WorkerEnvVar
) {
	logger.info(`\nPopulating ${populateCacheOptions.target} KV incremental cache...`);

	const binding = config.kv_namespaces.find(
		({ binding }: { binding: string }) => binding === KV_CACHE_BINDING_NAME
	);
	if (!binding) {
		throw new Error(`No KV binding "${KV_CACHE_BINDING_NAME}" found!`);
	}

	const prefix = envVars[KV_CACHE_PREFIX_ENV_NAME];
	const assets = await getCacheAssets(buildOpts);

	if (assets.length === 0) {
		logger.info("No cache assets to populate");
		return;
	}

	const chunkSize = Math.max(1, populateCacheOptions.cacheChunkSize ?? 25);
	const totalChunks = Math.ceil(assets.length / chunkSize);

	logger.info(
		`Inserting ${assets.length} assets to ${populateCacheOptions.target} KV in chunks of ${chunkSize}`
	);

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

		const result = runWrangler(
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

		if (!result.success) {
			throw new Error(`Wrangler kv bulk put command failed${result.stderr ? `:\n${result.stderr}` : ""}`);
		}
	}

	logger.info(`Successfully populated cache with ${assets.length} entries`);
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
		throw new Error(`No D1 binding "${D1_TAG_BINDING_NAME}" found!`);
	}

	const result = runWrangler(
		buildOpts,
		[
			"d1 execute",
			D1_TAG_BINDING_NAME,
			// Columns:
			//   tag           - The cache tag.
			//   revalidatedAt - Timestamp (ms) when the tag was last revalidated.
			//   stale         - Timestamp (ms) when the cached entry becomes stale. Added in v1.19.
			//   expire        - Timestamp (ms) when the cached entry expires. NULL means no expire. Added in v1.19.
			`--command "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER default NULL, UNIQUE(tag) ON CONFLICT REPLACE);"`,
			`--preview ${populateCacheOptions.shouldUsePreviewId}`,
		],
		{
			target: populateCacheOptions.target,
			environment: populateCacheOptions.environment,
			configPath: populateCacheOptions.wranglerConfigPath,
			logging: "error",
		}
	);

	if (!result.success) {
		throw new Error(`Wrangler d1 execute command failed${result.stderr ? `:\n${result.stderr}` : ""}`);
	}

	// Schema migration: add `stale` and `expire` columns (idempotent, safe for existing deployments).
	// The columns were added in v1.19 to support SWR.
	// These commands are intentionally non-throwing — they fail harmlessly if the columns already exist.
	runWrangler(
		buildOpts,
		[
			"d1 execute",
			D1_TAG_BINDING_NAME,
			`--command "ALTER TABLE revalidations ADD COLUMN stale INTEGER; ALTER TABLE revalidations ADD COLUMN expire INTEGER default NULL"`,
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
				"local [args..]",
				"Local dev server cache",
				(c) => withPopulateCacheOptions(c),
				(args) => populateCacheCommand("local", withWranglerPassthroughArgs(args))
			)
			.command(
				"remote [args..]",
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
