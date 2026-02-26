import logger from "@opennextjs/aws/logger.js";
import type yargs from "yargs";

import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import { getEnvFromPlatformProxy } from "./utils/helpers.js";
import { runWrangler } from "./utils/run-wrangler.js";
import type { WithWranglerArgs } from "./utils/utils.js";
import {
	getNormalizedOptions,
	printHeaders,
	readWranglerConfig,
	retrieveCompiledConfig,
	withWranglerPassthroughArgs,
} from "./utils/utils.js";

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

	const result = runWrangler(buildOpts, ["dev", ...args.wranglerArgs], { logging: "all" });

	if (!result.success) {
		logger.error(`Wrangler dev command failed${result.stderr ? `:\n${result.stderr}` : ""}`);
		process.exit(1);
	}
}

/**
 * Add the `preview` command to yargs configuration.
 *
 * Consumes 1 positional parameter.
 */
export function addPreviewCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"preview [args..]",
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
