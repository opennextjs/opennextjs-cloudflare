import { runWrangler } from "../utils/run-wrangler.js";
import { populateCache } from "./populate-cache.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCompiledAppCLI } from "./setup-cli.js";

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
