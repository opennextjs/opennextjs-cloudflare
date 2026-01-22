import type yargs from "yargs";

import { runWrangler } from "../utils/run-wrangler.js";
import { getEnvFromPlatformProxy } from "./helpers.js";
import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import type { WithWranglerArgs } from "./utils.js";
import {
	getNormalizedOptions,
	printHeaders,
	readWranglerConfig,
	retrieveCompiledConfig,
	withWranglerPassthroughArgs,
} from "./utils.js";

/**
 * Implementation of the `opennextjs-cloudflare preview` command.
 *
 * @param args
 */
export async function previewCommand(
	args: WithWranglerArgs<{ cacheChunkSize?: number; remote: boolean }>
): Promise<void> {
	printHeaders("preview");

	const { config } = await retrieveCompiledConfig();
	const buildOpts = getNormalizedOptions(config);

	const wranglerConfig = await readWranglerConfig(args);
	const envVars = await getEnvFromPlatformProxy(config, buildOpts);

	await populateCache(
		buildOpts,
		config,
		wranglerConfig,
		{
			target: args.remote ? "remote" : "local",
			environment: args.env,
			wranglerConfigPath: args.wranglerConfigPath,
			cacheChunkSize: args.cacheChunkSize,
			shouldUsePreviewId: args.remote,
		},
		envVars
	);

	runWrangler(buildOpts, ["dev", ...args.wranglerArgs], { logging: "all" });
}

/**
 * Add the `preview` command to yargs configuration.
 *
 * Consumes 1 positional parameter.
 */
export function addPreviewCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"preview",
		"Preview a built OpenNext app with a Wrangler dev server",
		(c) =>
			withPopulateCacheOptions(c).option("remote", {
				type: "boolean",
				alias: "r",
				default: false,
				desc: "Run on the global Cloudflare network with access to production resources",
			}),
		(args) => previewCommand(withWranglerPassthroughArgs(args))
	);
}
