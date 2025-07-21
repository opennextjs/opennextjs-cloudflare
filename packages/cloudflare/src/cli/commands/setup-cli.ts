import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { normalizeOptions } from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import { unstable_readConfig } from "wrangler";
import type yargs from "yargs";

import { OpenNextConfig } from "../../api/config.js";
import { ensureCloudflareConfig } from "../build/utils/index.js";

export type WithWranglerArgs<T = unknown> = T & {
	wranglerArgs: string[];
	configPath: string | undefined;
	env: string | undefined;
};

const nextAppDir = process.cwd();

/**
 * Setup the CLI, print necessary messages, and retrieve various options and configs.
 *
 * @param command
 * @param args
 * @param getOpenNextConfig - Function that resolves to a config file
 * @returns CLI options, OpenNext config, and Wrangler config
 */
export async function setupCLI(
	command: string,
	args: WithWranglerArgs,
	getOpenNextConfig: (baseDir: string) => Promise<{ config: OpenNextConfig; buildDir: string }>
) {
	printHeader(`Cloudflare ${command}`);

	showWarningOnWindows();

	const baseDir = nextAppDir;
	const require = createRequire(import.meta.url);
	const openNextDistDir = path.dirname(require.resolve("@opennextjs/aws/index.js"));

	const { config, buildDir } = await getOpenNextConfig(baseDir);
	ensureCloudflareConfig(config);

	// Initialize options
	const options = normalizeOptions(config, openNextDistDir, buildDir);
	logger.setLevel(options.debug ? "debug" : "info");

	const wranglerConfig = unstable_readConfig({ env: args.env, config: args.config });

	return { options, config, wranglerConfig, baseDir };
}

/**
 * Setup the CLI, print necessary messages, and resolve the compiled OpenNext config.
 *
 * @param command
 * @param args
 * @returns CLI config
 */
export function setupCompiledAppCLI(command: string, args: WithWranglerArgs) {
	return setupCLI(command, args, async (baseDir) => {
		const configPath = path.join(baseDir, ".open-next/.build/open-next.config.edge.mjs");

		if (!existsSync(configPath)) {
			logger.error("Could not find compiled Open Next config");
			process.exit(1);
		}

		const config = await import(configPath).then((mod) => mod.default);

		// Note: buildDir is not used when an app is already compiled.
		return { config, buildDir: baseDir };
	});
}

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

export function withWranglerPassthroughArgs<
	T extends yargs.ArgumentsCamelCase<{
		configPath: string | undefined;
		env: string | undefined;
	}>,
>(args: T) {
	return { ...args, wranglerArgs: getWranglerArgs(args) };
}
