/**
 * ESBuild plugin to handle pages router context.
 *
 * We need to change `.shared-runtime` imports to point at the vendored contexts used by
 * `pages-runtime.prod.js`, mirroring `next/dist/server/require-hook.js` for dependencies
 * in `node_modules` that webpack leaves externalized.
 */

import { BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import type { OnResolveResult, PluginBuild } from "esbuild";

export function patchPagesRouterContext(buildOpts: BuildOptions) {
	const pathRegex = /^(?:.*[/\\])?(?<CONTEXT>[^/\\]+)\.shared-runtime(?:\.js)?$/;
	const isAfter15 = compareSemver(buildOpts.nextVersion, ">=", "15.0.0");
	const basePath = `next/dist/server/${isAfter15 ? "" : "future/"}route-modules/pages/vendored/contexts/`;
	return {
		name: "pages-router-context",
		setup: (build: PluginBuild) => {
			// Externalized packages (e.g. `next-seo` requiring `next/head`) still import `*.shared-runtime`
			// across Next 15.3+ and 16.x; Node resolves them via `next/dist/server/require-hook.js`, which
			// is shimmed out on Workers.
			build.onResolve(
				{ filter: /\.shared-runtime(?:\.js)?$/ },
				async ({ path, resolveDir, ...options }): Promise<OnResolveResult | undefined> => {
					const match = path.match(pathRegex);
					if (match && match.groups?.CONTEXT) {
						const newPath = `${basePath}${match.groups.CONTEXT}.js`;
						const resolved = await build.resolve(newPath, {
							resolveDir,
							...options,
						});
						if (resolved.errors.length === 0) {
							return resolved;
						}
						if (buildOpts.appPath && buildOpts.appPath !== resolveDir) {
							const fallback = await build.resolve(newPath, {
								resolveDir: buildOpts.appPath,
								...options,
							});
							if (fallback.errors.length === 0) {
								return fallback;
							}
						}
						return resolved;
					}
				}
			);
		},
	};
}
