import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { compareSemver } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

export type WranglerTarget = "local" | "remote";

type WranglerOptions = {
	target?: WranglerTarget;
	environment?: string;
	logging?: "all" | "error";
};

/**
 * Checks the package.json `packageManager` field to determine whether yarn modern is used.
 *
 * @param options Build options.
 * @returns Whether yarn modern is used.
 */
function isYarnModern(options: BuildOptions) {
	const packageJson: { packageManager?: string } = JSON.parse(
		readFileSync(path.join(options.monorepoRoot, "package.json"), "utf-8")
	);

	if (!packageJson.packageManager?.startsWith("yarn")) return false;

	const [, version] = packageJson.packageManager.split("@");
	return version ? compareSemver(version, ">=", "4.0.0") : false;
}

/**
 * Prepends CLI flags with `--` so that certain package managers can pass args through to wrangler
 * properly.
 *
 * npm and yarn classic require `--` to be used, while pnpm and bun require that it is not used.
 *
 * @param options Build options.
 * @param args CLI args.
 * @returns Arguments with a passthrough flag injected when needed.
 */
function injectPassthroughFlagForArgs(options: BuildOptions, args: string[]) {
	if (options.packager !== "npm" && (options.packager !== "yarn" || isYarnModern(options))) {
		return args;
	}

	const flagInArgsIndex = args.findIndex((v) => v.startsWith("--"));
	if (flagInArgsIndex !== -1) {
		args.splice(flagInArgsIndex, 0, "--");
	}

	return args;
}

export function runWrangler(options: BuildOptions, args: string[], wranglerOpts: WranglerOptions = {}) {
	const result = spawnSync(
		options.packager,
		[
			options.packager === "bun" ? "x" : "exec",
			"wrangler",
			...injectPassthroughFlagForArgs(
				options,
				[
					...args,
					wranglerOpts.environment && `--env ${wranglerOpts.environment}`,
					wranglerOpts.target === "remote" && "--remote",
					wranglerOpts.target === "local" && "--local",
				].filter((v): v is string => !!v)
			),
		],
		{
			shell: true,
			stdio: wranglerOpts.logging === "error" ? ["ignore", "ignore", "inherit"] : "inherit",
			env: {
				...process.env,
				...(wranglerOpts.logging === "error" ? { WRANGLER_LOG: "error" } : undefined),
			},
		}
	);

	if (result.status !== 0) {
		logger.error("Wrangler command failed");
		process.exit(1);
	}
}

export function isWranglerTarget(v: string | undefined): v is WranglerTarget {
	return !!v && ["local", "remote"].includes(v);
}

/**
 * Returns the value of the flag.
 *
 * The value is retrieved for `<argName> value` or `<argName>=value`.
 *
 * @param args List of args
 * @param argName The arg name with leading dashes, i.e. `--env` or `-e`
 * @returns The value or undefined when not found
 */
export function getFlagValue(args: string[], ...argNames: string[]): string | undefined {
	if (argNames.some((name) => !name.startsWith("-"))) {
		// Names should start with "-" or "--"
		throw new Error(`Invalid arg names: ${argNames}`);
	}

	for (const argName of argNames) {
		for (let i = 0; i <= args.length; i++) {
			const arg = args[i];
			if (!arg) continue;

			if (arg === argName) {
				return args[i + 1];
			}

			if (arg.startsWith(argName)) {
				return arg.split("=")[1];
			}
		}
	}
}

/**
 * Find the value of the environment flag (`--env` / `-e`) used by Wrangler.
 *
 * @param args - CLI arguments.
 * @returns Value of the environment flag or undefined when not found
 */
export function getWranglerEnvironmentFlag(args: string[]): string | undefined {
	return getFlagValue(args, "--env", "-e");
}

/**
 * Find the value of the config flag (`--config` / `-c`) used by Wrangler.
 *
 * @param args - CLI arguments.
 * @returns Value of the config flag or undefined when not found
 */
export function getWranglerConfigFlag(args: string[]): string | undefined {
	return getFlagValue(args, "--config", "-c");
}
