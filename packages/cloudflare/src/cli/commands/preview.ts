import type yargs from "yargs";

import { runWrangler } from "../utils/run-wrangler.js";
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
export async function previewCommand(args: WithWranglerArgs<{ cacheChunkSize: number }>): Promise<void> {
	printHeaders("preview");

	const { config } = await retrieveCompiledConfig();
	const options = getNormalizedOptions(config);

	const wranglerConfig = readWranglerConfig(args);

	await populateCache(options, config, wranglerConfig, {
		target: "local",
		environment: args.env,
		configPath: args.configPath,
		cacheChunkSize: args.cacheChunkSize,
	});

	runWrangler(options, ["dev", ...args.wranglerArgs], { logging: "all" });
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
		(c) => withPopulateCacheOptions(c),
		(args) => previewCommand(withWranglerPassthroughArgs(args))
	);
}
