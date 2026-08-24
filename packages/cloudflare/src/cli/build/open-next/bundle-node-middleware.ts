/**
 * Bundles the Node.js middleware (`proxy.ts` / `middleware.ts` with the `nodejs` runtime)
 * into a Workers compatible `middleware/handler.mjs`.
 *
 * NOTE: Running Next.js Node.js middleware on workerd is experimental and is not supported
 * by the OpenNext maintainers. It re-bundles the middleware compiled by Next.js, which is an
 * internal output that can change between Next.js versions.
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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { builtinModules, isBuiltin } from "node:module";
import path from "node:path";

import { type BuildOptions, getBundlerRuntime, getPackagePath } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { openNextEdgePlugins } from "@opennextjs/aws/plugins/edge.js";
import { openNextExternalMiddlewarePlugin } from "@opennextjs/aws/plugins/externalMiddleware.js";
import { openNextReplacementPlugin } from "@opennextjs/aws/plugins/replacement.js";
import { openNextResolvePlugin } from "@opennextjs/aws/plugins/resolve.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { build, type Plugin } from "esbuild";
import { glob } from "glob";

import { normalizePath } from "../../utils/normalize-path.js";
import { patchWebpackRuntime } from "../patches/ast/webpack-runtime.js";
import { patchTurbopackRuntimeCode } from "../patches/plugins/turbopack.js";
import { setWranglerExternal } from "../patches/plugins/wrangler-external.js";

/**
 * Inlines the chunks of the middleware compiled by Next.js.
 *
 * Both the webpack and the Turbopack runtimes resolve the chunks they need at runtime,
 * which workerd does not support. The same patches as for the server are used to inline them.
 *
 * @param options Build options.
 * @param dotNextServerDir The `.next/server` directory of the middleware output.
 */
async function inlineMiddlewareChunks(options: BuildOptions, dotNextServerDir: string): Promise<void> {
	if (getBundlerRuntime(options) !== "turbopack") {
		await patchWebpackRuntime(dotNextServerDir);
		return;
	}

	const runtimePath = path.join(dotNextServerDir, "chunks/[turbopack]_runtime.js");
	if (!existsSync(runtimePath)) {
		throw new Error(`Turbopack runtime not found at ${runtimePath}`);
	}

	// The Turbopack runtime resolves the chunks relative to the `.next` directory.
	// `.wasm` chunks are needed too: they are inlined as static imports by `loadWasmChunk`.
	const tracedFiles = await glob(path.join(dotNextServerDir, "**/*.{js,wasm}"), {
		windowsPathsNoEscape: true,
	});

	writeFileSync(
		runtimePath,
		patchTurbopackRuntimeCode({
			code: readFileSync(runtimePath, "utf-8"),
			filePath: normalizePath(runtimePath),
			tracedFiles,
		})
	);
}

/**
 * Resolves the middleware compiled by Next.js to the copy created by `copyTracedFiles`.
 *
 * `@opennextjs/aws`'s `nodeMiddlewareHandler` loads the middleware with a dynamic
 * `await import("./.next/server/middleware.js")` that nothing on the aws side resolves (it relies
 * on the adapter bundling it), so this resolves that specifier to the traced copy.
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
 *
 * This mirrors `handleRequireCallsToNodeJSBuiltins` in wrangler's `hybrid-nodejs-compat`
 * esbuild plugin, which applies the same `require` to ESM conversion for `nodejs_compat`.
 * Keep the two in sync:
 * https://github.com/cloudflare/workers-sdk/blob/c457bfc6b5a575586354f5b0ad7a1100eff915fe/packages/wrangler/src/deployment-bundle/esbuild-plugins/hybrid-nodejs-compat.ts#L102-L133
 * The virtual module here additionally re-exports the named exports and falls back to the
 * whole module when the builtin has no default export.
 */
export function nodeBuiltinsPlugin(): Plugin {
	const namespace = "node-builtins";
	// Match only Node.js builtins so esbuild does not call back on every import:
	// the `node:` prefixed form and the bare names (`crypto`, `fs`, ...).
	const builtinsFilter = new RegExp(`^(node:|(${builtinModules.join("|")})$)`);
	return {
		name: namespace,
		setup(build) {
			build.onResolve({ filter: builtinsFilter }, ({ path: specifier, kind }) => {
				if (!isBuiltin(specifier)) {
					return undefined;
				}
				const prefixed = specifier.startsWith("node:") ? specifier : `node:${specifier}`;
				return kind === "require-call" ? { path: prefixed, namespace } : { path: prefixed, external: true };
			});
			build.onLoad({ filter: /^node:/, namespace }, ({ path: builtin }) => ({
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

	// The bundler runtime resolves the chunks of the middleware at runtime, which workerd does
	// not support. Inline the chunks so that they are statically bundled.
	await inlineMiddlewareChunks(options, dotNextServerDir);

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

	// `next/dist/server/lib/trace/tracer.js` requires `@opentelemetry/api`, an optional
	// dependency that most apps do not install. On the edge runtime Next.js does not fall
	// back to its compiled copy when the require throws, so alias to that copy - but only
	// when the app has not installed the real package, otherwise the real one is used.
	const hasOpentelemetry = existsSync(
		path.join(options.appBuildOutputPath, "node_modules", "@opentelemetry", "api")
	);

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
			// The base of the middleware compiled by Next.js is runtime agnostic. "edge" selects its
			// Web API code paths (which workerd supports) over the Node.js server paths (which it does
			// not): it also skips `setup-node-env.external.js`, which patches read-only workerd globals.
			// Node.js builtins used by the middleware are still provided by workerd via `nodejs_compat`.
			"process.env.NEXT_RUNTIME": '"edge"',
			"process.env.NODE_ENV": '"production"',
		},
		alias: {
			// See `hasOpentelemetry` above.
			...(hasOpentelemetry ? {} : { "@opentelemetry/api": "next/dist/compiled/@opentelemetry/api" }),
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
			// `.wasm` and `.bin` files are bundled by wrangler, not by this build
			setWranglerExternal(),
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

// Next.js' compiled middleware references \`AsyncLocalStorage\` as a global. workerd only
// exposes it via \`node:async_hooks\` (not as a global, even with \`nodejs_compat\`), so it is
// assigned here - as \`@opennextjs/aws\`'s edge middleware bundler does.
import { AsyncLocalStorage } from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;

// Next.js sets \`__import_unsupported\` on \`globalThis\` with \`configurable: false\`.
// When the middleware and the server share a Worker, the second call would throw,
// so it is skipped when the property is already set. Otherwise it runs as usual.
// See https://github.com/vercel/next.js/blob/5b7833e3/packages/next/src/server/web/globals.ts#L94-L98
const defaultDefineProperty = Object.defineProperty;
Object.defineProperty = function (o, p, a) {
	if (p === "__import_unsupported" && Boolean(globalThis.__import_unsupported)) {
		// \`Object.defineProperty\` returns the object it was passed.
		return o;
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
