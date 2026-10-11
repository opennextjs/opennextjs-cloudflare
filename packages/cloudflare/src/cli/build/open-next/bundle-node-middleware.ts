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
import { builtinModules, createRequire, isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type BuildOptions, getBundlerRuntime, getPackagePath } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import { openNextEdgePlugins } from "@opennextjs/aws/plugins/edge.js";
import { openNextExternalMiddlewarePlugin } from "@opennextjs/aws/plugins/externalMiddleware.js";
import { openNextReplacementPlugin } from "@opennextjs/aws/plugins/replacement.js";
import { openNextResolvePlugin } from "@opennextjs/aws/plugins/resolve.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { build, type Plugin } from "esbuild";
import { glob } from "glob";

import { getOpenNextConfig } from "../../../api/config.js";
import { normalizePath } from "../../utils/normalize-path.js";
import { patchWebpackRuntime } from "../patches/ast/webpack-runtime.js";
import { patchInstrumentation } from "../patches/plugins/instrumentation.js";
import { patchTurbopackRuntimeCode, patchTurbopackWasmChunkCode } from "../patches/plugins/turbopack.js";
import { setWranglerExternal } from "../patches/plugins/wrangler-external.js";

/**
 * Reads the files listed in a trace emitted by Next.js (e.g. `.next/server/middleware.js.nft.json`).
 *
 * @param tracePath Path of the `.nft.json` trace.
 * @returns The traced files, relative to the directory of the trace, or `undefined` when the trace
 *          is missing or can not be parsed.
 */
export function readNftTrace(tracePath: string): string[] | undefined {
	if (!existsSync(tracePath)) {
		return undefined;
	}
	try {
		const trace = JSON.parse(readFileSync(tracePath, "utf-8")) as { files?: unknown };
		if (!Array.isArray(trace.files)) {
			throw new Error("`files` is not an array");
		}
		return trace.files.filter((file): file is string => typeof file === "string");
	} catch (e) {
		logger.warn(`Could not read the trace ${tracePath}, all the chunks are bundled in the middleware: ${e}`);
		return undefined;
	}
}

/**
 * Removes the files only used by the instrumentation hook from the `.next/server` output.
 *
 * `copyTracedFiles` copies the chunks of other entries (e.g. `instrumentation.js`) next to the
 * middleware ones. Inlining them would bundle code the middleware never loads - and fail the build
 * when that code imports a package that is not traced for the middleware (see #1401).
 *
 * Only the files traced for the instrumentation hook and not for the middleware are candidates for
 * removal, so a chunk missing from both traces is still inlined. Nothing is removed when either
 * trace is missing. The middleware and the Turbopack runtime are always kept.
 *
 * A candidate chunk is kept when a kept file references it: Turbopack loads the chunks by their
 * path relative to `.next` (e.g. `"server/chunks/foo.js"`), so a chunk loaded by an `await import()`
 * is kept even if the middleware trace were to miss it. The references are followed transitively.
 *
 * @param files Absolute paths of the files in `.next/server`.
 * @param dotNextServerDir The `.next/server` directory, the traces are relative to it.
 * @param middlewareTrace The files traced for the middleware.
 * @param instrumentationTrace The files traced for the instrumentation hook.
 * @param readFile Returns the content of a file from `files`.
 * @returns The files to inline.
 */
export function excludeInstrumentationOnlyFiles(
	files: string[],
	dotNextServerDir: string,
	middlewareTrace: string[] | undefined,
	instrumentationTrace: string[] | undefined,
	readFile: (file: string) => string
): string[] {
	if (middlewareTrace === undefined || instrumentationTrace === undefined) {
		return files;
	}
	const resolve = (file: string) => normalizePath(path.resolve(dotNextServerDir, normalizePath(file)));
	const traced = new Set([...middlewareTrace, "middleware.js", "chunks/[turbopack]_runtime.js"].map(resolve));
	const instrumentationOnly = new Set(
		[...instrumentationTrace, "instrumentation.js"].map(resolve).filter((file) => !traced.has(file))
	);

	// Candidate files mapped to the path the Turbopack runtime loads them with.
	// Only the chunks can be loaded by the runtime: `instrumentation.js` (the entry) is never kept.
	const candidates = new Map<string, string | undefined>();
	const kept: string[] = [];
	for (const file of files) {
		if (instrumentationOnly.has(normalizePath(path.resolve(file)))) {
			const chunkPath = normalizePath(
				path.posix.join("server", normalizePath(path.relative(dotNextServerDir, file)))
			);
			candidates.set(file, chunkPath.startsWith("server/chunks/") ? chunkPath : undefined);
		} else {
			kept.push(file);
		}
	}

	const toScan = [...kept];
	for (let file = toScan.pop(); file !== undefined && candidates.size > 0; file = toScan.pop()) {
		if (!file.endsWith(".js")) {
			continue;
		}
		const code = readFile(file);
		for (const [candidate, chunkPath] of candidates) {
			if (chunkPath !== undefined && code.includes(chunkPath)) {
				candidates.delete(candidate);
				toScan.push(candidate);
			}
		}
	}

	return files.filter((file) => !candidates.has(file));
}

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
	// The output also holds the chunks of the instrumentation hook, which the middleware never loads.
	const appServerDir = path.join(options.appBuildOutputPath, ".next/server");
	const tracedFiles = excludeInstrumentationOnlyFiles(
		await glob(path.join(dotNextServerDir, "**/*.{js,wasm}"), { windowsPathsNoEscape: true }),
		dotNextServerDir,
		readNftTrace(path.join(appServerDir, "middleware.js.nft.json")),
		readNftTrace(path.join(appServerDir, "instrumentation.js.nft.json")),
		(file) => readFileSync(file, "utf-8")
	);

	writeFileSync(
		runtimePath,
		patchTurbopackRuntimeCode({
			code: readFileSync(runtimePath, "utf-8"),
			filePath: normalizePath(runtimePath),
			tracedFiles,
		})
	);

	// Since Next.js 16.3 the wasm helpers are emitted in the chunks rather than in the runtime.
	for (const chunkPath of tracedFiles) {
		if (!chunkPath.endsWith(".js") || normalizePath(chunkPath) === normalizePath(runtimePath)) {
			continue;
		}
		const code = readFileSync(chunkPath, "utf-8");
		const patched = patchTurbopackWasmChunkCode({ code, tracedFiles });
		if (patched !== code) {
			writeFileSync(chunkPath, patched);
		}
	}
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
 * Returns the path of a shim from `templates/shims` in the package dist.
 *
 * `cloudflare-templates` is only copied to the output dir by `bundleServer`, after the middleware
 * bundle is built, so the shims are taken from the package dist.
 *
 * @param shim Name of the shim.
 */
function getShimPath(shim: "empty" | "fetch" | "throw"): string {
	return path.join(path.dirname(fileURLToPath(import.meta.url)), `../../templates/shims/${shim}.js`);
}

/**
 * Resolves `specifier` from `fromFile`, falling back to `specifier` when it can not be resolved.
 *
 * @param fromFile The file to resolve from.
 * @param specifier The module to resolve.
 */
function resolveFrom(fromFile: string, specifier: string): string {
	try {
		return createRequire(fromFile).resolve(specifier);
	} catch {
		return specifier;
	}
}

/**
 * Makes the Node.js builtins used by the bundled code (i.e. `require("crypto")` or
 * `import from "node:crypto"`) resolve to the modules workerd provides via `nodejs_compat`.
 *
 * `require` calls are converted into a virtual CommonJS module re-exporting the builtin.
 * The virtual module has to stay CommonJS - esbuild classifies it as such because it assigns to
 * `module.exports` and uses no `export` keyword - so that `require("crypto")` receives the module
 * workerd provides rather than an esbuild `__toCommonJS` wrapper built from its named exports,
 * which would drop whatever the named exports do not expose and add a synthetic `__esModule`.
 *
 * The conversion is kept in sync with `handleRequireCallsToNodeJSBuiltins` in wrangler's
 * `hybrid-nodejs-compat` esbuild plugin, which is the source of truth:
 * https://github.com/cloudflare/workers-sdk/blob/c457bfc6b5a575586354f5b0ad7a1100eff915fe/packages/wrangler/src/deployment-bundle/esbuild-plugins/hybrid-nodejs-compat.ts#L102-L133
 *
 * It differs on a single intentional point: the builtin is imported as a namespace and
 * `mod.default ?? mod` is used rather than a default import, so that a builtin without a `default`
 * export can not fail to link in workerd. wrangler applies the same fallback to its unenv aliases
 * in `handleUnenvAliasedPackages`.
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
					module.exports = mod.default ?? mod;
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
	// esbuild resolves an alias from the working directory, not from the importer. Resolve the
	// compiled copy from the traced middleware so that it is not bundled twice: once from the app's
	// `node_modules` (via the alias) and once from the traced files (via direct imports).
	const compiledOpentelemetryApi = resolveFrom(compiledMiddleware, "next/dist/compiled/@opentelemetry/api");

	const updater = new ContentUpdater(options);
	const outfile = path.join(middlewareDir, "handler.mjs");

	const result = await build({
		entryPoints: [path.join(options.openNextDistDir, "adapters", "middleware.js")],
		outfile,
		allowOverwrite: true,
		metafile: true,
		bundle: true,
		format: "esm",
		target: "es2022",
		// Resolve the packages as the server bundle does, see `bundle-server.ts`.
		// Next.js traces the files with the default `nft` conditions (`node`, `require`, `import` and
		// `default`): the `node` platform selects the same files. The conditions are always set - should
		// it be to an empty array - to disable the `module` condition, which selects untraced files.
		// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1401
		platform: "node",
		minify: options.minify,
		sourcemap: options.debug ? "inline" : false,
		sourcesContent: false,
		treeShaking: true,
		conditions: getOpenNextConfig(options).cloudflare?.useWorkerdCondition === false ? [] : ["workerd"],
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
			// Same size optimizations as the server bundle, see `bundle-server.ts`.
			// Workers have `fetch` so the `node-fetch` polyfill is not needed
			"next/dist/compiled/node-fetch": getShimPath("fetch"),
			// Workers have builtin Web Sockets
			"next/dist/compiled/ws": getShimPath("empty"),
			// The toolbox optimizer pulls several MB of dependencies (`caniuse-lite`, `terser`, `acorn`, ...)
			"next/dist/compiled/@ampproject/toolbox-optimizer": getShimPath("throw"),
			// The edge runtime sandbox is used by `next start` to run edge functions, not by the middleware
			"next/dist/compiled/edge-runtime": getShimPath("empty"),
			// See `hasOpentelemetry` above.
			...(hasOpentelemetry ? {} : { "@opentelemetry/api": compiledOpentelemetryApi }),
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
			// Next.js 16.3 registers the instrumentation hook from the middleware itself when the
			// middleware does not run on the edge runtime, by dynamically requiring
			// `.next/server/instrumentation.js` - which workerd does not support.
			//
			// The guard Next.js uses (`process.env.NEXT_RUNTIME !== "edge"`) is inlined to `"nodejs"`
			// when Next.js compiles the middleware, so the `define` above can not eliminate the branch.
			// The loader is stubbed out instead, which matches what the edge runtime does here: it has
			// no instrumentation entry to register, and the server function - which shares the isolate -
			// already registers the hook.
			// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1362
			patchInstrumentation(updater, options, { loadInstrumentation: false }),
			// Apply updater updates, must be the last plugin
			updater.plugin,
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

	writeFileSync(`${outfile}.meta.json`, JSON.stringify(result.metafile, null, 2));
}
