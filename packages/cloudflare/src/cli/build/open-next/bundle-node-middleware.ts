/**
 * Bundles the Node.js middleware (`proxy.ts` / `middleware.ts` with the `nodejs` runtime)
 * into a Workers compatible `middleware/handler.mjs`.
 *
 * `@opennextjs/aws` bundles the external middleware for a Node.js server:
 * the OpenNext config is read from the filesystem at runtime and the middleware compiled
 * by Next.js is loaded with `await import("./.next/server/middleware.js")`.
 *
 * workerd can not access the filesystem nor load modules at runtime, so the handler
 * built by `@opennextjs/aws` is replaced with a fully self-contained bundle:
 *
 * - the config manifests are inlined by `openNextEdgePlugins` (as for the edge middleware)
 * - the middleware compiled by Next.js is statically bundled from the traced files that
 *   `@opennextjs/aws` copies to `middleware/<package path>/.next/server/middleware.js`
 */

import { existsSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { openNextEdgePlugins } from "@opennextjs/aws/plugins/edge.js";
import { openNextExternalMiddlewarePlugin } from "@opennextjs/aws/plugins/externalMiddleware.js";
import { openNextReplacementPlugin } from "@opennextjs/aws/plugins/replacement.js";
import { openNextResolvePlugin } from "@opennextjs/aws/plugins/resolve.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { build, type Plugin } from "esbuild";

import { patchWebpackRuntime } from "../patches/ast/webpack-runtime.js";

/**
 * Resolves the middleware compiled by Next.js to the copy created by `copyTracedFiles`.
 */
export function setCompiledMiddlewarePlugin(compiledMiddlewarePath: string): Plugin {
	return {
		name: "compiled-middleware",
		setup(build) {
			build.onResolve({ filter: getCrossPlatformPathRegex("./.next/server/middleware.js") }, () => ({
				path: compiledMiddlewarePath,
			}));
		},
	};
}

/**
 * Makes the Node.js builtins used by the bundled code (i.e. `require("crypto")` or
 * `import from "node:crypto"`) resolve to the modules workerd provides via `nodejs_compat`.
 *
 * `require` calls are converted into ESM imports via a virtual module. The virtual module
 * re-exports the default export so that the interop helpers in the middleware compiled by
 * Next.js receive the full module (`export * from ...` alone would drop the default export).
 */
export function nodeBuiltinsPlugin(): Plugin {
	const namespace = "node-builtins";
	return {
		name: namespace,
		setup(build) {
			build.onResolve({ filter: /.*/ }, ({ path: specifier, kind }) => {
				if (!isBuiltin(specifier)) {
					return undefined;
				}
				const prefixed = specifier.startsWith("node:") ? specifier : `node:${specifier}`;
				return kind === "require-call" ? { path: prefixed, namespace } : { path: prefixed, external: true };
			});
			build.onLoad({ filter: /.*/, namespace }, ({ path: builtin }) => ({
				contents: `
					import * as mod from "${builtin}";
					export * from "${builtin}";
					export default mod.default ?? mod;
				`,
				loader: "js",
			}));
		},
	};
}

export async function bundleNodeMiddleware(options: BuildOptions): Promise<void> {
	const { config, outputDir } = options;

	const middlewareDir = path.join(outputDir, "middleware");
	const dotNextServerDir = path.join(middlewareDir, getPackagePath(options), ".next/server");
	const compiledMiddleware = path.join(dotNextServerDir, "middleware.js");

	if (!existsSync(compiledMiddleware)) {
		throw new Error(`Compiled Node.js middleware not found at ${compiledMiddleware}`);
	}

	// The middleware uses the same webpack runtime as the server, inline its dynamic requires
	// so that the chunks are statically bundled.
	await patchWebpackRuntime(dotNextServerDir);

	logger.info("Bundling Node.js middleware...");

	const middlewareConfig = config.middleware?.external ? config.middleware : undefined;
	const overrides = {
		...middlewareConfig?.override,
		originResolver: middlewareConfig?.originResolver,
	};
	function override<T extends keyof typeof overrides>(target: T) {
		// String and lazy loaded overrides are supported, see `buildEdgeBundle`
		return typeof overrides[target] === "string" || typeof overrides[target] === "function"
			? overrides[target]
			: undefined;
	}
	const includeCache = config.dangerous?.enableCacheInterception;

	await build({
		entryPoints: [path.join(options.openNextDistDir, "adapters", "middleware.js")],
		outfile: path.join(middlewareDir, "handler.mjs"),
		allowOverwrite: true,
		bundle: true,
		format: "esm",
		target: "es2022",
		platform: "neutral",
		minify: options.minify,
		sourcemap: options.debug ? "inline" : false,
		sourcesContent: false,
		treeShaking: true,
		conditions: ["module"],
		mainFields: ["module", "main"],
		external: ["node:*", "./open-next.config.mjs"],
		define: {
			// The base of the middleware compiled by Next.js is runtime agnostic.
			// "edge" skips the setup of the Node.js environment (`setup-node-env.external.js`
			// patches globals that are read-only in workerd). Node.js builtin modules used by
			// the middleware are provided by workerd via `nodejs_compat`.
			"process.env.NEXT_RUNTIME": '"edge"',
			"process.env.NODE_ENV": '"production"',
		},
		alias: {
			path: "node:path",
			stream: "node:stream",
			fs: "node:fs",
			// `next/dist/server/lib/trace/tracer.js` requires `@opentelemetry/api`, an optional
			// dependency that most apps do not install. On the Node.js runtime Next.js falls back
			// to its own compiled copy when the require throws, but not on the edge runtime.
			// Use the compiled copy, which is always present.
			"@opentelemetry/api": "next/dist/compiled/@opentelemetry/api",
		},
		plugins: [
			openNextResolvePlugin({
				overrides: {
					wrapper: override("wrapper") ?? "cloudflare-edge",
					converter: override("converter") ?? "edge",
					...(includeCache
						? {
								tagCache: override("tagCache"),
								incrementalCache: override("incrementalCache"),
								queue: override("queue"),
							}
						: {}),
					originResolver: override("originResolver") ?? "pattern-env",
					proxyExternalRequest: override("proxyExternalRequest") ?? "fetch",
				},
				fnName: "middleware",
			}),
			openNextReplacementPlugin({
				name: "externalMiddlewareOverrides",
				target: getCrossPlatformPathRegex("adapters/middleware.js"),
				deletes: includeCache ? [] : ["includeCacheInMiddleware"],
			}),
			// Handle the middleware with the OpenNext Node.js middleware handler
			openNextExternalMiddlewarePlugin(
				path.join(options.openNextDistDir, "core", "nodeMiddlewareHandler.js")
			),
			setCompiledMiddlewarePlugin(compiledMiddleware),
			// Must be registered before `openNextEdgePlugins` to handle `require("node:*")` calls
			nodeBuiltinsPlugin(),
			// Inline the config manifests
			openNextEdgePlugins({
				nextDir: path.join(options.appBuildOutputPath, ".next"),
				isInCloudflare: true,
			}),
		] as Plugin[],
		banner: {
			js: `
import { Buffer } from "node:buffer";
globalThis.Buffer = Buffer;

import { AsyncLocalStorage } from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;

// Next.js sets \`__import_unsupported\` on \`globalThis\` with \`configurable: false\`.
// The middleware and the server both run this code in the same Worker, the second
// call would throw so it is skipped.
// See https://github.com/vercel/next.js/blob/5b7833e3/packages/next/src/server/web/globals.ts#L94-L98
const defaultDefineProperty = Object.defineProperty;
Object.defineProperty = function (o, p, a) {
	if (p === "__import_unsupported" && Boolean(globalThis.__import_unsupported)) {
		return;
	}
	return defaultDefineProperty(o, p, a);
};

globalThis.openNextDebug = ${options.debug};
globalThis.openNextVersion = "${options.openNextVersion}";
globalThis.nextVersion = "${options.nextVersion}";
`,
		},
	});
}
