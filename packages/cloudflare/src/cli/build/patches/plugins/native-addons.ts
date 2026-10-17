/**
 * ESBuild plugin to stub Node.js native addons (`.node` files).
 *
 * Native addons are compiled binaries that workerd cannot load.
 * ESBuild has no loader for `.node` files and fails the whole build when one is required,
 * even when the package requiring it falls back on a JS implementation when it is missing
 * (e.g. `ssh2` requiring `cpu-features` in a `try/catch`).
 *
 * The plugin swaps native addons for a module that throws a `MODULE_NOT_FOUND` error when evaluated,
 * so that such fallbacks are used at runtime.
 *
 * See https://github.com/opennextjs/opennextjs-cloudflare/issues/1226
 */

import { isAbsolute, resolve } from "node:path";

import logger from "@opennextjs/aws/logger.js";
import type { OnResolveResult, PluginBuild } from "esbuild";

import { normalizePath } from "../../../utils/normalize-path.js";

export function stubNativeAddons() {
	const name = "native-addons";
	const namespace = `${name}-stub`;

	return {
		name,

		setup: async (build: PluginBuild) => {
			// Only warn once per addon
			const warnedAddons = new Set<string>();

			build.onResolve({ filter: /\.node$/ }, ({ path, resolveDir }): OnResolveResult => {
				// Resolve relative paths to make the warning and the error easier to diagnose.
				// The file does not need to exist.
				const addonPath =
					resolveDir && (path.startsWith(".") || isAbsolute(path))
						? normalizePath(resolve(resolveDir, path))
						: path;

				if (!warnedAddons.has(addonPath)) {
					warnedAddons.add(addonPath);
					logger.warn(
						`Native addon "${addonPath}" is not supported on Workers and has been stubbed. Requiring it throws at runtime.`
					);
				}

				return { path: addonPath, namespace };
			});

			// The error carries Node's `MODULE_NOT_FOUND` code so that callers fall back as if the addon was not installed.
			build.onLoad({ filter: /.*/, namespace }, ({ path }) => {
				const message = JSON.stringify(`Native addon "${path}" is not supported on Workers`);
				return {
					contents: `const error = new Error(${message}); error.code = "MODULE_NOT_FOUND"; throw error;`,
					loader: "js",
				};
			});
		},
	};
}
