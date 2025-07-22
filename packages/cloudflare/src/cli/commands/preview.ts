import type yargs from "yargs";

import { runWrangler } from "../utils/run-wrangler.js";
import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCLI, withWranglerPassthroughArgs } from "./setup-cli.js";

/**
 * Implementation of the `opennextjs-cloudflare preview` command.
 *
 * @param args
 */
export async function previewCommand(args: WithWranglerArgs<{ cacheChunkSize: number }>): Promise<void> {
	const { options, config, wranglerConfig } = await setupCLI({ command: "preview", args });

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
