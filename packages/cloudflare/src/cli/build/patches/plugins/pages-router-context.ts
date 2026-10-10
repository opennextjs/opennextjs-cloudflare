/**
 * ESBuild plugin to handle pages router context.
 *
 * Remaps `*.shared-runtime` requests to the contexts vendored in the pages runtime
 * (`next/dist/compiled/next-server/pages[-turbo].runtime.prod.js`) so that there is a single instance of each context.
 *
 * Next.js does the same in Node via `next/dist/server/require-hook.js`, which patches `Module.prototype.require`:
 * https://github.com/vercel/next.js/blob/48540b836642525b38a2cba40a92b4532c553a52/packages/next/src/server/require-hook.ts#L59-L68
 * That hook is shimmed in the worker (see `require-hook.ts`) so the remapping has to happen at bundle time.
 *
 * Next.js aliases these imports in the code it bundles, but Pages Router dependencies are kept external
 * and loaded from `node_modules` (e.g. `next-seo` requiring `next/head`).
 * Without the remap, `next/dist/shared/lib/head.js` would get its own `HeadManagerContext` and `<Head>` tags
 * rendered by those dependencies would be dropped from the HTML.
 * See https://github.com/opennextjs/opennextjs-cloudflare/issues/1389
 */

import { BuildOptions, compareSemver } from "@opennextjs/aws/build/helper.js";
import type { OnResolveResult, PluginBuild } from "esbuild";

export function patchPagesRouterContext(buildOpts: BuildOptions) {
	// Matches the context name in requests like `./head-manager-context.shared-runtime`.
	const filter = /(?:^|\/)(?<CONTEXT>[^/]+)\.shared-runtime$/;
	const isAfter15 = compareSemver(buildOpts.nextVersion, ">=", "15.0.0");
	const basePath = `next/dist/server/${isAfter15 ? "" : "future/"}route-modules/pages/vendored/contexts/`;
	// Marks the resolutions initiated by this plugin so that they are not remapped again.
	// Defensive: the remapped path ends with `.js` so it can not match the filter.
	const marker = {};

	return {
		name: "pages-router-context",
		setup: (build: PluginBuild) => {
			build.onResolve(
				{ filter },
				async ({ path, pluginData, ...options }): Promise<OnResolveResult | undefined> => {
					const context = path.match(filter)?.groups?.CONTEXT;
					if (pluginData === marker || !context) {
						return undefined;
					}
					const result = await build.resolve(`${basePath}${context}.js`, {
						...options,
						pluginData: marker,
					});
					// Fall back to the default resolution when there is no vendored context for the request.
					return result.errors.length > 0 ? undefined : result;
				}
			);
		},
	};
}
