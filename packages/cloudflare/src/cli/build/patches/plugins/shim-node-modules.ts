/**
 * ESBuild plugin to shim Node.js built-in modules that are incompatible with
 * Cloudflare Workers, even with the `nodejs_compat` compatibility flag.
 *
 * Unlike esbuild's `alias` config, an `onResolve` plugin intercepts resolution
 * before esbuild's `platform: "node"` logic marks built-ins as external, so
 * the shim is actually bundled into the worker.
 */

import type { PluginBuild } from "esbuild";

/**
 * Replaces imports of `perf_hooks` and `node:perf_hooks` with a Workers-compatible
 * shim. Next.js 16.2.x's `gc-observer` and packages like `@vercel/otel` import
 * `PerformanceObserver` / `performance` from this module; the shim re-exports
 * `globalThis.performance` and provides a no-op `PerformanceObserver`.
 */
export function shimNodeModules(shimPerfHooksPath: string) {
	return {
		name: "shim-node-modules",

		setup(build: PluginBuild) {
			build.onResolve({ filter: /^(node:)?perf_hooks$/ }, () => ({
				path: shimPerfHooksPath,
			}));
		},
	};
}
