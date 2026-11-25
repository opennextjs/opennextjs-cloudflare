/**
 * ESBuild plugin to handle pages router context.
 *
 * We need to change `.shared-runtime` imports to point at the vendored contexts used by
 * `pages-runtime.prod.js`, mirroring `next/dist/server/require-hook.js` for dependencies
 * in `node_modules` that webpack leaves externalized.
 */

import { BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import type { OnResolveResult, PluginBuild } from "esbuild";

const NEXT_PACKAGE_PATH_RE = /(?:^|[/\\])node_modules[/\\]next(?:[/\\]|$)/;

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
				async ({ path, resolveDir, importer, ...options }): Promise<OnResolveResult | undefined> => {
					const isNextImport =
						path.startsWith("next/") ||
						NEXT_PACKAGE_PATH_RE.test(importer) ||
						NEXT_PACKAGE_PATH_RE.test(resolveDir);
					if (!isNextImport) {
						return undefined;
					}

					const match = path.match(pathRegex);
					if (match && match.groups?.CONTEXT) {
						const newPath = `${basePath}${match.groups.CONTEXT}.js`;
						const resolved = await build.resolve(newPath, {
							resolveDir,
							importer,
							...options,
						});
						if (resolved.errors.length === 0) {
							return resolved;
						}
						if (buildOpts.appPath && buildOpts.appPath !== resolveDir) {
							const fallback = await build.resolve(newPath, {
								resolveDir: buildOpts.appPath,
								importer,
								...options,
							});
							if (fallback.errors.length === 0) {
								return fallback;
							}
						}
						return undefined;
					}
				}
			);
		},
	};
}
