import { BuildOptions } from "@opennextjs/aws/build/helper.js";

import type { OpenNextConfig } from "../../api/config.js";
import { DEPLOYMENT_MAPPING_ENV_NAME } from "../templates/skew-protection.js";
import { getWranglerEnvironmentFlag, runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy, quoteShellMeta } from "./helpers.js";
import { populateCache } from "./populate-cache.js";
import { getDeploymentMapping } from "./skew-protection.js";

export async function deploy(
	options: BuildOptions,
	config: OpenNextConfig,
	deployOptions: { passthroughArgs: string[]; cacheChunkSize?: number }
) {
	const envVars = await getEnvFromPlatformProxy({
		// TODO: Pass the configPath, update everywhere applicable
		environment: getWranglerEnvironmentFlag(deployOptions.passthroughArgs),
	});

	const deploymentMapping = await getDeploymentMapping(options, config, envVars);

	await populateCache(options, config, {
		target: "remote",
		environment: getWranglerEnvironmentFlag(deployOptions.passthroughArgs),
		cacheChunkSize: deployOptions.cacheChunkSize,
	});

	runWrangler(
		options,
		[
			"deploy",
			...deployOptions.passthroughArgs,
			...(deploymentMapping
				? [`--var ${DEPLOYMENT_MAPPING_ENV_NAME}:${quoteShellMeta(JSON.stringify(deploymentMapping))}`]
				: []),
		],
		{
			logging: "all",
		}
	);
}
