import { type BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getPlatformProxy, type GetPlatformProxyOptions } from "wrangler";

import { extractProjectEnvVars } from "../build/utils/extract-project-env-vars.js";

export type WorkerEnvVar = Record<keyof CloudflareEnv, string | undefined>;

/**
 * Returns the env vars to use by the CLI.
 *
 * The environments variables are returned from a combination of `process.env`, wrangler config, and `.env*` files.
 *
 * Recommended usage on CI:
 *
 * - Add you secrets to `process.env` (i.e. `CF_ACCOUNT_ID`)
 * - Add public values to the wrangler config `wrangler.jsonc` (i.e. `R2_CACHE_PREFIX_ENV_NAME`)
 *
 * Note: `.dev.vars*` and `.env*` should not be checked in.
 *
 * Recommended usage for local dev:
 *
 * - Add you secrets to either a `.dev.vars*` or `.env*` file (i.e. `CF_ACCOUNT_ID`)
 * - Add public values to the wrangler config `wrangler.jsonc` (i.e. `R2_CACHE_PREFIX_ENV_NAME`)
 *
 * Note: `.env*` files are also used by `next dev` while `.dev.var*` files are only loaded by `wrangler`.
 *
 * Loading details:
 *
 * 1. The variables are first initialized from `process.env`
 * 2. They are then augmented/replaced with variables from the wrangler config (`wrangler.jsonc` and `.dev.vars*`)
 * 3. They are then augmented with variables from `.env*` files (existing values are not replaced).
 *
 * @param options Options to pass to `getPlatformProxy`, i.e. to set the environment
 * @param buildOpts Open Next build options
 * @returns the env vars
 */
export async function getEnvFromPlatformProxy(options: GetPlatformProxyOptions, buildOpts: BuildOptions) {
	// 1. Start from `process.env`
	const envVars = process.env;

	// 2. Apply vars from workers `env`
	const proxy = await getPlatformProxy<CloudflareEnv>({
		...options,
		// Next.js uses a different mechanism to load `.env*` files from wrangler.
		// We prevent wrangler for loading the files and handle that in `getEnvFromPlatformProxy`.
		envFiles: [],
	});

	Object.entries(proxy.env).forEach(([key, value]) => {
		if (typeof value === "string") {
			// filter out bindings by only considering string values
			envVars[key as keyof CloudflareEnv] = value;
		}
	});

	await proxy.dispose();

	// 3. Apply new vars from `.env*` files
	let mode: "production" | "development" | "test" = "production";
	if (envVars.NEXTJS_ENV === "development") {
		mode = "development";
	} else if (envVars.NEXTJS_ENV === "test") {
		mode = "test";
	}

	const dotEnvVars = extractProjectEnvVars(mode, buildOpts);

	for (const varName in dotEnvVars) {
		envVars[varName] ??= dotEnvVars[varName];
	}

	return envVars as unknown as WorkerEnvVar;
}

/**
 * Escape shell metacharacters.
 *
 * When `spawnSync` is invoked with `shell: true`, metacharacters need to be escaped.
 *
 * Based on https://github.com/ljharb/shell-quote/blob/main/quote.js
 *
 * @param arg
 * @returns escaped arg
 */
export function quoteShellMeta(arg: string) {
	if (process.platform === "win32") {
		if (arg.length === 0) {
			return '""';
		}
		const needsEscaping = /[&|<>^()%!"]/;
		const needsQuotes = /\s/.test(arg) || needsEscaping.test(arg);
		let escaped = arg.replace(/"/g, '""');
		if (/[&|<>^()%!]/.test(arg)) {
			escaped = escaped.replace(/[&|<>^()%!]/g, "^$&");
		}
		return needsQuotes ? `"${escaped}"` : escaped;
	}
	if (/["\s]/.test(arg) && !/'/.test(arg)) {
		return `'${arg.replace(/(['\\])/g, "\\$1")}'`;
	}
	if (/["'\s]/.test(arg)) {
		return `"${arg.replace(/(["\\$`!])/g, "\\$1")}"`;
	}
	return arg.replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}])/g, "$1\\$2");
}
