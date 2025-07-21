import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { normalizeOptions } from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import { unstable_readConfig } from "wrangler";
import type yargs from "yargs";

import { OpenNextConfig } from "../../api/config.js";
import { createOpenNextConfigIfNotExistent, ensureCloudflareConfig } from "../build/utils/index.js";

export type WithWranglerArgs<T = unknown> = T & {
	// Array of arguments that can be given to wrangler commands, including the `--config` and `--env` args.
	wranglerArgs: string[];
	configPath: string | undefined;
	env: string | undefined;
};

const nextAppDir = process.cwd();

type Options = {
	command: string;
	shouldCompileConfig?: boolean;
	args: WithWranglerArgs;
};

/**
 * Sets up the CLI and returns config information:
 * - Prints necessary header messages and warnings,
 * - Retrieves the OpenNext config and validates it.
 * - Initialises the OpenNext options.
 * - Reads the Wrangler config.
 *
 * @param command
 * @param shouldCompileConfig
 * @param args
 * @returns CLI options, OpenNext config, and Wrangler config.
 */
export async function setupCLI({ command, shouldCompileConfig, args }: Options) {
	printHeader(`Cloudflare ${command}`);

	showWarningOnWindows();

	const baseDir = nextAppDir;
	const require = createRequire(import.meta.url);
	const openNextDistDir = path.dirname(require.resolve("@opennextjs/aws/index.js"));

	const { config, buildDir } = await getOpenNextConfig({ shouldCompileConfig, baseDir });
	ensureCloudflareConfig(config);

	// Initialize options
	const options = normalizeOptions(config, openNextDistDir, buildDir);
	logger.setLevel(options.debug ? "debug" : "info");

	const wranglerConfig = unstable_readConfig({ env: args.env, config: args.configPath });

	return { options, config, wranglerConfig, baseDir };
}

async function getOpenNextConfig(opts: {
	shouldCompileConfig?: boolean;
	baseDir: string;
}): Promise<{ config: OpenNextConfig; buildDir: string }> {
	if (opts.shouldCompileConfig) {
		await createOpenNextConfigIfNotExistent(opts.baseDir);

		return compileOpenNextConfig(opts.baseDir, undefined, { compileEdge: true });
	}

	const configPath = path.join(opts.baseDir, ".open-next/.build/open-next.config.edge.mjs");

	if (!existsSync(configPath)) {
		logger.error("Could not find compiled Open Next config");
		process.exit(1);
	}

	const config = await import(configPath).then((mod) => mod.default);

	// Note: buildDir is not used when an app is already compiled.
	return { config, buildDir: opts.baseDir };
}

/**
 * Add flags for the wrangler config path and environment to the yargs configuration.
 */
export function withWranglerOptions<T extends yargs.Argv>(args: T) {
	return args
		.options("configPath", {
			type: "string",
			alias: ["config", "c"],
			desc: "Path to Wrangler configuration file",
		})
		.options("env", {
			type: "string",
			alias: "e",
			desc: "Wrangler environment to use for operations",
		});
}

/**
 *
 * @param args
 * @returns An array of arguments that can be given to wrangler commands, including the `--config` and `--env` args.
 */
function getWranglerArgs(args: {
	_: (string | number)[];
	configPath: string | undefined;
	env: string | undefined;
}): string[] {
	return [
		...(args.configPath ? ["--config", args.configPath] : []),
		...(args.env ? ["--env", args.env] : []),
		// Note: the first args in `_` will be the commands.
		...args._.slice(args._[0] === "populateCache" ? 2 : 1).map((a) => `${a}`),
	];
}

/**
 *
 * @param args
 * @returns The inputted args, and an array of arguments that can be given to wrangler commands, including the `--config` and `--env` args.
 */
export function withWranglerPassthroughArgs<
	T extends yargs.ArgumentsCamelCase<{
		configPath: string | undefined;
		env: string | undefined;
	}>,
>(args: T) {
	return { ...args, wranglerArgs: getWranglerArgs(args) };
}
