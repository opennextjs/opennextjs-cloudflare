import { DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta } from "./helpers.js";
import { populateCache } from "./populate-cache.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCompiledAppCLI } from "./setup-cli.js";
import { getDeploymentMapping } from "./skew-protection.js";

export async function deployCommand(args: WithWranglerArgs<{ cacheChunkSize: number }>) {
	const { options, config, wranglerConfig } = await setupCompiledAppCLI("deploy", args);

	const envVars = await getEnvFromPlatformProxy({
		configPath: args.config,
		environment: args.env,
	});

	const deploymentMapping = await getDeploymentMapping(options, config, envVars);

	await populateCache(options, config, wranglerConfig, {
		target: "remote",
		environment: args.env,
		configPath: args.config,
		cacheChunkSize: args.cacheChunkSize,
	});

	runWrangler(
		options,
		[
			"deploy",
			...args.passthrough,
			...(deploymentMapping
				? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
				: []),
		],
		{
			logging: "all",
		}
	);
}
