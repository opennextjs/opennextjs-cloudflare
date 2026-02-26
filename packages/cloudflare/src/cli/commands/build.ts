import logger from "@opennextjs/aws/logger.js";
import type yargs from "yargs";

import { build as buildImpl } from "../build/build.js";
import { askConfirmation } from "../utils/ask-confirmation.js";
import { createWranglerConfigFile, findWranglerConfig } from "../utils/create-wrangler-config.js";
import type { WithWranglerArgs } from "./utils/utils.js";
import {
	compileConfig,
	getNormalizedOptions,
	nextAppDir,
	printHeaders,
	readWranglerConfig,
	withWranglerOptions,
	withWranglerPassthroughArgs,
} from "./utils/utils.js";

/**
 * Implementation of the `opennextjs-cloudflare build` command.
 *
 * @param args
 */
export async function buildCommand(
	args: WithWranglerArgs<{
		skipNextBuild: boolean;
		noMinify: boolean;
		skipWranglerConfigCheck: boolean;
		openNextConfigPath: string | undefined;
		dangerouslyUseUnsupportedNextVersion: boolean;
	}>
): Promise<void> {
	printHeaders("build");

	const { config, buildDir } = await compileConfig(args.openNextConfigPath);
	const options = getNormalizedOptions(config, buildDir);

	const projectOpts = { ...args, minify: !args.noMinify, sourceDir: nextAppDir };

	// Ask whether a `wrangler.jsonc` should be created when no config file exists.
	// Note: We don't ask when a custom config file is specified via `--config`
	//       nor when `--skipWranglerConfigCheck` is used.
	if (!projectOpts.wranglerConfigPath && !args.skipWranglerConfigCheck) {
		if (!findWranglerConfig(projectOpts.sourceDir)) {
			const confirmCreate = "No `wrangler.(toml|json|jsonc)` config file found, do you want to create one?";
			if (await askConfirmation(confirmCreate)) {
				await createWranglerConfigFile(projectOpts.sourceDir);
			} else {
				logger.warn(`No Wrangler config file created

(to avoid this check use the \`--skipWranglerConfigCheck\` flag or set a \`SKIP_WRANGLER_CONFIG_CHECK\` environment variable to \`yes\`)`);
			}
		}
	}

	const wranglerConfig = await readWranglerConfig(args);

	await buildImpl(options, config, projectOpts, wranglerConfig, args.dangerouslyUseUnsupportedNextVersion);
}

/**
 * Add the `build` command to yargs configuration.
 *
 * Consumes 1 positional parameter.
 */
export function addBuildCommand<T extends yargs.Argv>(y: T) {
	return y.command(
		"build [args..]",
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
				})
				.option("openNextConfigPath", {
					type: "string",
					desc: "Path to the OpenNext configuration file",
				})
				.option("dangerouslyUseUnsupportedNextVersion", {
					type: "boolean",
					default: false,
					desc: "Allow using unsupported Next.js versions",
				}),
		(args) => buildCommand(withWranglerPassthroughArgs(args))
	);
}
