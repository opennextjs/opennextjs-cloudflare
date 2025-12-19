/**
 * Next.js 16.1+ includes a fast-set-immediate module that tries to assign to read-only exports.
 * We already provide setImmediate via the banner import from node:timers, so we can safely
 * replace this module with an empty implementation.
 */

import type { Plugin } from "esbuild";

export function shimFastSetImmediate(): Plugin {
	return {
		name: "shim-fast-set-immediate",
		setup(build) {
			// Intercept the import of fast-set-immediate.external
			build.onResolve({ filter: /fast-set-immediate\.external/ }, (args) => {
				// Only intercept if it's being imported from node-environment-extensions
				if (args.path.includes("fast-set-immediate")) {
					return {
						path: args.path,
						namespace: "fast-set-immediate-shim",
					};
				}
				return undefined;
			});

			build.onLoad({ filter: /.*/, namespace: "fast-set-immediate-shim" }, () => {
				return {
					contents: `
// Shimmed by @opennextjs/cloudflare
// setImmediate is already provided via node:timers import in the banner
export const DANGEROUSLY_runPendingImmediatesAfterCurrentTask = () => {};
export const expectNoPendingImmediates = () => {};
export const unpatchedSetImmediate = globalThis.setImmediate;
`,
					loader: "js",
				};
			});
		},
	};
}
