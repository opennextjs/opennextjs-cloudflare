import type yargs from "yargs";

import { DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta } from "./helpers.js";
import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
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
 * Implementation of the `opennextjs-cloudflare deploy` command.
 *
 * @param args
 */
export async function deployCommand(args: WithWranglerArgs<{ cacheChunkSize?: number }>): Promise<void> {
	printHeaders("deploy");

	const { config } = await retrieveCompiledConfig();
	const options = getNormalizedOptions(config);

	const wranglerConfig = readWranglerConfig(args);

	const envVars = await getEnvFromPlatformProxy({
		configPath: args.wranglerConfigPath,
		environment: args.env,
	});

	const deploymentMapping = await getDeploymentMapping(options, config, envVars);

	await populateCache(options, config, wranglerConfig, {
		target: "remote",
		environment: args.env,
		wranglerConfigPath: args.wranglerConfigPath,
		cacheChunkSize: args.cacheChunkSize,
		shouldUsePreviewId: false,
	});

	runWrangler(
		options,
		[
			"deploy",
			...args.wranglerArgs,
			...(deploymentMapping
				? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
				: []),
		],
		{
			logging: "all",
		}
	);
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
		(c) => withPopulateCacheOptions(c),
		(args) => deployCommand(withWranglerPassthroughArgs(args))
	);
}
