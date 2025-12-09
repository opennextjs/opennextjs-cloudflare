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
	configPath?: string;
	logging?: "all" | "error";
	env?: Record<string, string>;
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
	const shouldPipeLogs = wranglerOpts.logging === "error";

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
					wranglerOpts.configPath && `--config ${wranglerOpts.configPath}`,
					wranglerOpts.target === "remote" && "--remote",
					wranglerOpts.target === "local" && "--local",
				].filter((v): v is string => !!v)
			),
		],
		{
			shell: true,
			stdio: shouldPipeLogs ? ["ignore", "pipe", "pipe"] : "inherit",
			env: {
				...process.env,
				...wranglerOpts.env,
				// `.env` files are handled by the adapter.
				// Wrangler would load `.env.<wrangler env>` while we should load `.env.<process.env.NEXTJS_ENV>`
				// See https://opennext.js.org/cloudflare/howtos/env-vars
				CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
			},
		}
	);

	if (result.status !== 0) {
		if (shouldPipeLogs) {
			process.stdout.write(result.stdout.toString());
			process.stderr.write(result.stderr.toString());
		}

		logger.error("Wrangler command failed");
		process.exit(1);
	}
}

export function isWranglerTarget(v: string | undefined): v is WranglerTarget {
	return !!v && ["local", "remote"].includes(v);
}
