import type yargs from "yargs";

import { DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta } from "./helpers.js";
import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCLI, withWranglerPassthroughArgs } from "./setup-cli.js";
import { getDeploymentMapping } from "./skew-protection.js";

/**
 * Implementation of the `opennextjs-cloudflare deploy` command.
 *
 * @param args
 */
export async function deployCommand(args: WithWranglerArgs<{ cacheChunkSize: number }>): Promise<void> {
	const { options, config, wranglerConfig } = await setupCLI({ command: "deploy", args });

	const envVars = await getEnvFromPlatformProxy({
		configPath: args.configPath,
		environment: args.env,
	});

	const deploymentMapping = await getDeploymentMapping(options, config, envVars);

	await populateCache(options, config, wranglerConfig, {
		target: "remote",
		environment: args.env,
		configPath: args.configPath,
		cacheChunkSize: args.cacheChunkSize,
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
