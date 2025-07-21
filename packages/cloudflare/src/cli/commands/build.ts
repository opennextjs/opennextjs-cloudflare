import type yargs from "yargs";

import { build as buildImpl } from "../build/build.js";
import type { WithWranglerArgs } from "./setup-cli.js";
import { setupCLI, withWranglerOptions, withWranglerPassthroughArgs } from "./setup-cli.js";

/**
 * Implementation of the `opennextjs-clouflare build` command.
 *
 * @param args
 */
async function buildCommand(
	args: WithWranglerArgs<{
		skipNextBuild: boolean;
		noMinify: boolean;
		skipWranglerConfigCheck: boolean;
	}>
): Promise<void> {
	const { options, config, wranglerConfig, baseDir } = await setupCLI({
		command: "build",
		shouldCompileConfig: true,
		args,
	});

	await buildImpl(options, config, { ...args, minify: !args.noMinify, sourceDir: baseDir }, wranglerConfig);
}

/**
 * Add the `build` command to yargs configuration.
 *
 * Consumes 1 positional parameter.
 */
export function addBuildCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"build",
		"Build an OpenNext Cloudflare worker",
		(c) =>
			withWranglerOptions(c)
				.option("skipNextBuild", {
					type: "boolean",
					alias: ["skipBuild", "s"],
					default: ["1", "true", "yes"].includes(String(process.env.SKIP_NEXT_APP_BUILD)),
					desc: "Skip building the Next.js app",
				})
				.option("noMinify", {
					type: "boolean",
					default: false,
					desc: "Disable worker minification",
				})
				.option("skipWranglerConfigCheck", {
					type: "boolean",
					default: ["1", "true", "yes"].includes(String(process.env.SKIP_WRANGLER_CONFIG_CHECK)),
					desc: "Skip checking for a Wrangler config",
				}),
		(args) => buildCommand(withWranglerPassthroughArgs(args))
	);
}
