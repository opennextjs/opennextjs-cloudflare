import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type { IncludedIncrementalCache, LazyLoadedOverride, OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import type { Unstable_Config as WranglerConfig } from "wrangler";
import type yargs from "yargs";

import { NAME as R2_CACHE_NAME } from "../../api/overrides/incremental-cache/r2-incremental-cache.js";
import { DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { runWrangler, runWranglerCapture } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta, type WorkerEnvVar } from "./helpers.js";
import {
	CACHE_POPULATE_TOKEN_ENV_NAME,
	generateCachePopulateToken,
	getCacheAssets,
	populateCache,
	populateR2IncrementalCacheViaBinding,
	withPopulateCacheOptions,
} from "./populate-cache.js";
import { getDeploymentMapping } from "./skew-protection.js";
import type { WithWranglerArgs } from "./utils.js";
import {
	getNormalizedOptions,
	printHeaders,
	readWranglerConfig,
	retrieveCompiledConfig,
	withWranglerPassthroughArgs,
} from "./utils.js";

/**
 * Threshold for using binding-based R2 cache population in "auto" mode.
 * If the number of cache assets exceeds this, we use the binding approach
 * to avoid wrangler CLI rate limits.
 */
const R2_BINDING_THRESHOLD = 500;

/**
 * Cache population method options.
 * - "auto": Automatically select based on cache size (binding for 500+ entries)
 * - "wrangler": Always use wrangler CLI (original behavior)
 * - "binding": Always use worker binding (new approach)
 */
export type CacheMethod = "auto" | "wrangler" | "binding";

/** Deploy command arguments */
type DeployArgs = {
	cacheChunkSize?: number;
	cacheMethod?: CacheMethod;
};

/**
 * Implementation of the `opennextjs-cloudflare deploy` command.
 *
 * @param args
 */
export async function deployCommand(args: WithWranglerArgs<DeployArgs>): Promise<void> {
	printHeaders("deploy");

	const { config } = await retrieveCompiledConfig();
	const buildOpts = getNormalizedOptions(config);
	const wranglerConfig = await readWranglerConfig(args);
	const envVars = await getEnvFromPlatformProxy(config, buildOpts);

	const { incrementalCache } = config.default.override ?? {};
	const useR2Cache = incrementalCache && (await isR2Cache(incrementalCache));
	const cacheAssets = getCacheAssets(buildOpts);
	const cacheMethod = args.cacheMethod ?? "auto";

	// Determine which method to use
	const useBindingPopulate = shouldUseBindingPopulate(cacheMethod, useR2Cache, cacheAssets.length);

	if (useBindingPopulate) {
		if (cacheMethod === "auto") {
			logger.info(`\nDetected ${cacheAssets.length} cache assets (> ${R2_BINDING_THRESHOLD})`);
			logger.info("Using worker binding for R2 cache population to avoid API rate limits...\n");
		} else {
			logger.info("\nUsing worker binding for R2 cache population (--cacheMethod=binding)...\n");
		}
		await deployWithBindingCachePopulation(args, config, buildOpts, wranglerConfig, envVars);
	} else {
		if (cacheMethod === "wrangler" && useR2Cache && cacheAssets.length > R2_BINDING_THRESHOLD) {
			logger.warn(
				`\nWarning: Using wrangler CLI for ${cacheAssets.length} cache assets. ` +
				`This may hit Cloudflare API rate limits. Consider using --cacheMethod=auto or --cacheMethod=binding.\n`
			);
		}
		await deployWithWranglerCachePopulation(args, config, buildOpts, wranglerConfig, envVars);
	}
}

/**
 * Determines whether to use the binding-based cache population.
 */
function shouldUseBindingPopulate(
	cacheMethod: CacheMethod,
	useR2Cache: boolean,
	cacheAssetCount: number
): boolean {
	// Binding approach only works with R2 cache
	if (!useR2Cache) {
		if (cacheMethod === "binding") {
			logger.warn("--cacheMethod=binding is only supported for R2 cache. Falling back to wrangler CLI.");
		}
		return false;
	}

	switch (cacheMethod) {
		case "wrangler":
			return false;
		case "binding":
			return true;
		case "auto":
		default:
			return cacheAssetCount > R2_BINDING_THRESHOLD;
	}
}

/**
 * Traditional deploy flow: populate cache via wrangler CLI, then deploy.
 * Used for small caches (< R2_BINDING_THRESHOLD) or non-R2 caches.
 */
async function deployWithWranglerCachePopulation(
	args: WithWranglerArgs<DeployArgs>,
	config: OpenNextConfig,
	buildOpts: BuildOptions,
	wranglerConfig: WranglerConfig,
	envVars: WorkerEnvVar
): Promise<void> {
	// Populate cache using wrangler CLI (traditional approach)
	await populateCache(
		buildOpts,
		config,
		wranglerConfig,
		{
			target: "remote",
			environment: args.env,
			wranglerConfigPath: args.wranglerConfigPath,
			cacheChunkSize: args.cacheChunkSize,
			shouldUsePreviewId: false,
		},
		envVars
	);

	const deploymentMapping = await getDeploymentMapping(buildOpts, config, envVars);

	runWrangler(
		buildOpts,
		[
			"deploy",
			...args.wranglerArgs,
			...(deploymentMapping
				? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
				: []),
		],
		{
			logging: "all",
			env: {
				OPEN_NEXT_DEPLOY: "true",
			},
		}
	);
}

/**
 * New deploy flow for large R2 caches:
 * 1. Deploy worker with a temporary cache populate token
 * 2. Populate cache by sending entries directly to the worker
 * 3. Optionally redeploy to remove the token (for security)
 *
 * This approach bypasses wrangler's r2 bulk put which uses the Cloudflare API
 * and is rate-limited to 1,200 requests per 5 minutes.
 */
async function deployWithBindingCachePopulation(
	args: WithWranglerArgs<DeployArgs>,
	config: OpenNextConfig,
	buildOpts: BuildOptions,
	wranglerConfig: WranglerConfig,
	envVars: WorkerEnvVar
): Promise<void> {
	// Generate a temporary token for cache population
	const cachePopulateToken = generateCachePopulateToken();

	const deploymentMapping = await getDeploymentMapping(buildOpts, config, envVars);

	// Step 1: Deploy worker with the cache populate token
	logger.info("\n📦 Step 1/3: Deploying worker with cache populate endpoint...");

	const deployArgs = [
		"deploy",
		...args.wranglerArgs,
		`--var ${CACHE_POPULATE_TOKEN_ENV_NAME}:${cachePopulateToken}`,
		...(deploymentMapping
			? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
			: []),
	];

	// Capture the deploy output to extract the worker URL
	const deployOutput = runWranglerCapture(
		buildOpts,
		deployArgs,
		{
			logging: "all",
			env: {
				OPEN_NEXT_DEPLOY: "true",
			},
		}
	);

	// Extract worker URL from deploy output
	const workerUrl = extractWorkerUrl(deployOutput);
	if (!workerUrl) {
		throw new Error(
			"Could not determine worker URL from deploy output. " +
			"Please ensure your worker has a route or workers.dev subdomain configured."
		);
	}

	logger.info(`Worker deployed at: ${workerUrl}`);

	// Step 2: Populate cache via the worker
	logger.info("\n📦 Step 2/3: Populating R2 cache via worker binding...");

	try {
		await populateR2IncrementalCacheViaBinding(
			buildOpts,
			wranglerConfig,
			{
				workerUrl,
				token: cachePopulateToken,
				batchSize: args.cacheChunkSize ?? 100,
			},
			envVars
		);
	} catch (error) {
		logger.error("Cache population failed. The worker is deployed but cache may be incomplete.");
		throw error;
	}

	// Step 3: Redeploy without the token to secure the endpoint
	logger.info("\n📦 Step 3/3: Redeploying to remove cache populate endpoint...");

	runWrangler(
		buildOpts,
		[
			"deploy",
			...args.wranglerArgs,
			...(deploymentMapping
				? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
				: []),
		],
		{
			logging: "all",
			env: {
				OPEN_NEXT_DEPLOY: "true",
			},
		}
	);

	logger.info("\n✅ Deployment complete!");
}

/**
 * Extracts the worker URL from wrangler deploy output.
 *
 * Wrangler outputs lines like:
 * - "Published my-worker (1.23 sec)"
 * - "  https://my-worker.my-subdomain.workers.dev"
 * Or with routes:
 * - "  example.com/*"
 */
function extractWorkerUrl(output: string): string | null {
	// Look for workers.dev URL
	const workersDevMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
	if (workersDevMatch) {
		return workersDevMatch[0] ?? null;
	}

	// Look for custom domain route (less common)
	const routeMatch = output.match(/^\s+(https?:\/\/[^\s*]+)/m);
	if (routeMatch) {
		return routeMatch[1] ?? null;
	}

	// Look for any URL pattern
	const urlMatch = output.match(/https:\/\/[^\s]+/);
	if (urlMatch) {
		return urlMatch[0] ?? null;
	}

	return null;
}

async function isR2Cache(
	value: IncludedIncrementalCache | LazyLoadedOverride<IncrementalCache>
): Promise<boolean> {
	const name = typeof value === "function" ? (await value()).name : value;
	return name === R2_CACHE_NAME;
}

/**
 * Add deploy-specific options to the yargs configuration.
 */
function withDeployOptions<T extends yargs.Argv>(args: T) {
	return withPopulateCacheOptions(args).option("cacheMethod", {
		type: "string",
		choices: ["auto", "wrangler", "binding"] as const,
		default: "auto",
		desc: "Method for populating R2 cache during deployment",
		description:
			"Cache population method:\n" +
			"  auto     - Use binding for 500+ entries, wrangler CLI otherwise (default)\n" +
			"  wrangler - Always use wrangler CLI (original behavior)\n" +
			"  binding  - Always use worker binding (bypasses API rate limits)",
	});
}

/**
 * Validates and normalizes the cache method argument.
 */
function parseCacheMethod(value: string | undefined): CacheMethod {
	if (value === "wrangler" || value === "binding" || value === "auto") {
		return value;
	}
	return "auto";
}

/**
 * Add the `deploy` command to yargs configuration.
 *
 * Consumes 1 positional parameter.
 */
export function addDeployCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"deploy",
		"Deploy a built OpenNext app to Cloudflare Workers",
		(c) => withDeployOptions(c),
		(args) => {
			const normalizedArgs = {
				...withWranglerPassthroughArgs(args),
				cacheMethod: parseCacheMethod(args.cacheMethod),
			};
			return deployCommand(normalizedArgs);
		}
	);
}
