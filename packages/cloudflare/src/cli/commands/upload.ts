import type yargs from "yargs";

import { DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta } from "./helpers.js";
import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCompiledAppCLI, withWranglerPassthroughArgs } from "./setup-cli.js";
import { getDeploymentMapping } from "./skew-protection.js";

export async function uploadCommand(args: WithWranglerArgs<{ cacheChunkSize: number }>) {
	const { options, config, wranglerConfig } = await setupCompiledAppCLI("upload", args);

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
			"versions upload",
			...args.wranglerArgs,
			...(deploymentMapping
				? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
				: []),
		],
		{ logging: "all" }
	);
}

export function addUploadCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"upload",
		"Upload a built OpenNext app to Cloudflare Workers",
		(c) => withPopulateCacheOptions(c),
		(args) => uploadCommand(withWranglerPassthroughArgs(args))
	);
}
