import { BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import type { OnResolveResult, PluginBuild } from "esbuild";

/**
 * ESBuild plugin remapping `*.shared-runtime` imports to the contexts vendored in the pages runtime.
 *
 * Next.js does the same at runtime in `require-hook.js`, which is shimmed in the worker.
 * Without it, dependencies kept external (e.g. `next-seo` using `next/head`) get their own copy of the contexts.
 * See https://github.com/opennextjs/opennextjs-cloudflare/issues/1389
 *
 * @param buildOpts - The OpenNext build options.
 * @returns The esbuild plugin.
 */
export function patchPagesRouterContext(buildOpts: BuildOptions) {
	const pathRegex = /^.*\/(?<CONTEXT>.*)\.shared-runtime$/;
	const isAfter15 = compareSemver(buildOpts.nextVersion, ">=", "15.0.0");
	const basePath = `next/dist/server/${isAfter15 ? "" : "future/"}route-modules/pages/vendored/contexts/`;
	return {
		name: "pages-router-context",
		setup: (build: PluginBuild) => {
			// See https://github.com/vercel/next.js/blob/48540b836642525b38a2cba40a92b4532c553a52/packages/next/src/server/require-hook.ts#L59-L68
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
