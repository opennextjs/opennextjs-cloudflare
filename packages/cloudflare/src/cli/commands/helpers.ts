import { getPlatformProxy, type GetPlatformProxyOptions } from "wrangler";

export type WorkerEnvVar = Record<keyof CloudflareEnv, string | undefined>;

/**
 * Return the string env vars from the worker.
 *
 * @param options Options to pass to `getPlatformProxy`, i.e. to set the environment
 * @returns the env vars
 */
export async function getEnvFromPlatformProxy(options: GetPlatformProxyOptions) {
	const envVars = {} as WorkerEnvVar;
	const proxy = await getPlatformProxy<CloudflareEnv>(options);
	Object.entries(proxy.env).forEach(([key, value]) => {
		if (typeof value === "string") {
			envVars[key as keyof CloudflareEnv] = value;
		}
	});
	await proxy.dispose();
	return envVars;
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
	if (/["\s]/.test(arg) && !/'/.test(arg)) {
		return `'${arg.replace(/(['\\])/g, "\\$1")}'`;
	}
	if (/["'\s]/.test(arg)) {
		return `"${arg.replace(/(["\\$`!])/g, "\\$1")}"`;
	}
	return arg.replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}])/g, "$1\\$2");
}
