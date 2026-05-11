/**
 * ESBuild plugin to shim Node.js built-in modules and Next.js internal modules
 * that are incompatible with Cloudflare Workers, even with the `nodejs_compat`
 * compatibility flag.
 *
 * Unlike esbuild's `alias` config, an `onResolve` plugin intercepts resolution
 * before esbuild's `platform: "node"` logic marks built-ins as external, so
 * the shim is actually bundled into the worker.
 */

import type { PluginBuild } from "esbuild";

/**
 * Replaces incompatible modules with Workers-compatible shims:
 *
 * - `perf_hooks` / `node:perf_hooks`: Next.js 16.2.x's `gc-observer` and
 *   packages like `@vercel/otel` import `PerformanceObserver` / `performance`
 *   from this module; the shim re-exports `globalThis.performance` and
 *   provides a no-op `PerformanceObserver`.
 *
 * - `next/dist/server/node-environment-extensions/fast-set-immediate.external`:
 *   Next 16.2's app-render scheduler mutates the frozen `node:timers` module
 *   on import, which throws "Cannot assign to read only property 'setImmediate'
 *   of object '[object Module]'" under nodejs_compat. The shim no-ops the
 *   install() side effect; the scheduler optimization isn't needed in Workers.
 */
export function shimNodeModules(shimPerfHooksPath: string, shimFastSetImmediatePath: string) {
	return {
		name: "shim-node-modules",

		setup(build: PluginBuild) {
			build.onResolve({ filter: /^(node:)?perf_hooks$/ }, () => ({
				path: shimPerfHooksPath,
			}));
			build.onResolve({ filter: /fast-set-immediate\.external(\.js)?$/ }, () => ({
				path: shimFastSetImmediatePath,
			}));
		},
	};
}
