/**
 * ESBuild plugin to handle pages router context.
 *
 * We need to change the import path for the pages router context to use the one provided in `pages-runtime.prod.js`
 */

import { BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import type { OnResolveResult, PluginBuild } from "esbuild";

export function patchPagesRouterContext(buildOpts: BuildOptions) {
	const pathRegex = /^.*\/(?<CONTEXT>.*)\.shared-runtime$/;
	const isAfter15 = compareSemver(buildOpts.nextVersion, ">=", "15.0.0");
	const isAfter153 = compareSemver(buildOpts.nextVersion, ">=", "15.3.0");
	const basePath = `next/dist/server/${isAfter15 ? "" : "future/"}route-modules/pages/vendored/contexts/`;
	return {
		name: "pages-router-context",
		setup: (build: PluginBuild) => {
			// If we are after 15.3, we don't need to patch the context anymore
			if (isAfter153) {
				return;
			}
			// We need to modify some imports (i.e. https://github.com/vercel/next.js/blob/48540b836642525b38a2cba40a92b4532c553a52/packages/next/src/server/require-hook.ts#L59-L68)
			build.onResolve(
				{ filter: /.*shared-runtime/ },
				async ({ path, resolveDir, ...options }): Promise<OnResolveResult | undefined> => {
					const match = path.match(pathRegex);
					if (match && match.groups?.CONTEXT) {
						const newPath = `${basePath}${match.groups.CONTEXT}.js`;
						return await build.resolve(newPath, {
							resolveDir,
							...options,
						});
					}
				}
			);
		},
	};
}
