import type yargs from "yargs";

import { runWrangler } from "../utils/run-wrangler.js";
import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCompiledAppCLI, withWranglerPassthroughArgs } from "./setup-cli.js";

export async function previewCommand(args: WithWranglerArgs<{ cacheChunkSize: number }>) {
	const { options, config, wranglerConfig } = await setupCompiledAppCLI("preview", args);

	await populateCache(options, config, wranglerConfig, {
		target: "local",
		environment: args.env,
		configPath: args.config,
		cacheChunkSize: args.cacheChunkSize,
	});

	runWrangler(options, ["dev", ...args.wranglerArgs], { logging: "all" });
}

export function addPreviewCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"preview",
		"Preview a built OpenNext app with a Wrangler dev server",
		(c) => withPopulateCacheOptions(c),
		(args) => previewCommand(withWranglerPassthroughArgs(args))
	);
}
