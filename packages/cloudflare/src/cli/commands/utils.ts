import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { normalizeOptions } from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import { unstable_readConfig } from "wrangler";
import type yargs from "yargs";

import type { OpenNextConfig } from "../../api/config.js";
import { createOpenNextConfigIfNotExistent, ensureCloudflareConfig } from "../build/utils/index.js";

export type WithWranglerArgs<T = unknown> = T & {
	// Array of arguments that can be given to wrangler commands, including the `--config` and `--env` args.
	wranglerArgs: string[];
	wranglerConfigPath: string | undefined;
	env: string | undefined;
};

export const nextAppDir = process.cwd();

/**
 * Print headers and warnings for the CLI.
 *
 * @param command
 */
export function printHeaders(command: string) {
	printHeader(`Cloudflare ${command}`);

	showWarningOnWindows();
}

/**
 * Compile the OpenNext config.
 *
 * When users do not specify a custom config file (using `--openNextConfigPath`),
 * the CLI will offer to create one.
 *
 * When users specify a custom config file but it doesn't exist, we throw an Error.
 *
 * @param configPath Optional path to the config file. Absolute or relative to cwd.
 * @returns OpenNext config.
 */
export async function compileConfig(configPath: string | undefined) {
	if (configPath && !existsSync(configPath)) {
		throw new Error(`Custom config file not found at ${configPath}`);
	}

	if (!configPath) {
		configPath = await createOpenNextConfigIfNotExistent(nextAppDir);
	}

	const { config, buildDir } = await compileOpenNextConfig(configPath, { compileEdge: true });
	ensureCloudflareConfig(config);

	return { config, buildDir };
}

/**
 * Retrieve a compiled OpenNext config, and ensure it is for Cloudflare.
 *
 * @returns OpenNext config.
 */
export async function retrieveCompiledConfig() {
	const configPath = path.join(nextAppDir, ".open-next/.build/open-next.config.edge.mjs");

	if (!existsSync(configPath)) {
		logger.error("Could not find compiled Open Next config, did you run the build command?");
		process.exit(1);
	}

	const config = await import(configPath).then((mod) => mod.default);
	ensureCloudflareConfig(config);

	return { config };
}

/**
 * Normalize the OpenNext options and set the logging level.
 *
 * @param config
 * @param buildDir Directory to use when building the application
 * @returns Normalized options.
 */
export function getNormalizedOptions(config: OpenNextConfig, buildDir = nextAppDir) {
	const require = createRequire(import.meta.url);
	const openNextDistDir = path.dirname(require.resolve("@opennextjs/aws/index.js"));

	const options = normalizeOptions(config, openNextDistDir, buildDir);
	logger.setLevel(options.debug ? "debug" : "info");

	return options;
}

/**
 * Read the Wrangler config.
 *
 * @param args Wrangler environment and config path.
 * @returns Wrangler config.
 */
export function readWranglerConfig(args: WithWranglerArgs) {
	return unstable_readConfig({ env: args.env, config: args.wranglerConfigPath });
}

/**
 * Adds flags for the wrangler config path and environment to the yargs configuration.
 */
export function withWranglerOptions<T extends yargs.Argv>(args: T) {
	return args
		.option("config", {
			type: "string",
			alias: "c",
			desc: "Path to Wrangler configuration file",
		})
		.option("configPath", {
			type: "string",
			desc: "Path to Wrangler configuration file",
			deprecated: true,
		})
		.option("env", {
			type: "string",
			alias: "e",
			desc: "Wrangler environment to use for operations",
		});
}

type WranglerInputArgs = {
	configPath: string | undefined;
	config: string | undefined;
	env: string | undefined;
	remote?: boolean | undefined;
};

/**
 *
 * @param args
 * @returns An array of arguments that can be given to wrangler commands, including the `--config` and `--env` args.
 */
function getWranglerArgs(args: WranglerInputArgs & { _: (string | number)[] }): string[] {
	if (args.configPath) {
		logger.warn("The `--configPath` flag is deprecated, please use `--config` instead.");

		if (args.config) {
			logger.error(
				"Multiple config flags found. Please use the `--config` flag for your Wrangler config path."
			);
			process.exit(1);
		}
	}

	return [
		...(args.configPath ? ["--config", args.configPath] : []),
		...(args.config ? ["--config", args.config] : []),
		...(args.env ? ["--env", args.env] : []),
		...(args.remote ? ["--remote"] : []),
		// Note: the first args in `_` will be the commands.
		...args._.slice(args._[0] === "populateCache" ? 2 : 1).map((a) => `${a}`),
	];
}

/**
 *
 * @param args
 * @returns The inputted args, and an array of arguments that can be given to wrangler commands, including the `--config` and `--env` args.
 */
export function withWranglerPassthroughArgs<T extends yargs.ArgumentsCamelCase<WranglerInputArgs>>(
	args: T
): WithWranglerArgs<T> {
	return {
		...args,
		wranglerConfigPath: args.config ?? args.configPath,
		wranglerArgs: getWranglerArgs(args),
	};
}
