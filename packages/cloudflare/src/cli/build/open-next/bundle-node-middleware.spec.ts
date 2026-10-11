import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import logger from "@opennextjs/aws/logger.js";
import { build, type BuildOptions } from "esbuild";
import mockFs from "mock-fs";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
	excludeInstrumentationOnlyFiles,
	nodeBuiltinsPlugin,
	readNftTrace,
} from "./bundle-node-middleware.js";

const execFileAsync = promisify(execFile);

/**
 * Bundles `contents` with `nodeBuiltinsPlugin` installed.
 *
 * Mirrors the esbuild options `bundleNodeMiddleware` uses, as the plugin behaviour depends on
 * them: with `platform: "node"` esbuild would handle the Node.js builtins itself (as `__require`
 * calls) when the plugin did not resolve them first.
 *
 * @param contents Source of the entry point, treated as CommonJS.
 * @param options Extra esbuild options.
 * @returns The bundled output.
 */
async function bundle(contents: string, options: BuildOptions = {}): Promise<string> {
	const result = await build({
		stdin: { contents, loader: "js", resolveDir: import.meta.dirname },
		bundle: true,
		format: "esm",
		platform: "node",
		target: "es2022",
		write: false,
		logLevel: "silent",
		plugins: [nodeBuiltinsPlugin()],
		...options,
	});
	return result.outputFiles![0]!.text;
}

/**
 * Extracts the section of the bundle holding the virtual module for `builtin`.
 *
 * @param code The bundled output.
 * @param builtin The prefixed builtin, i.e. `node:crypto`.
 * @returns The lines of the section.
 */
function getVirtualModule(code: string, builtin: string): string {
	const header = `// node-builtins:${builtin}`;
	const start = code.indexOf(header);
	expect(start, `${header} not found in:\n${code}`).toBeGreaterThanOrEqual(0);
	const next = code.indexOf("\n//", start + header.length);
	return code.slice(start, next === -1 ? undefined : next).trim();
}

/**
 * Runs `script` in a Node.js child process with the bundle importable as `BUNDLE_URL`.
 *
 * The bundle has to be evaluated out of process: Vitest resolves dynamic imports through Vite,
 * which transforms the module and applies its own `node:` interop instead of running the bundle
 * as plain ESM. That silently makes the assertions below hold whatever the plugin emits.
 *
 * @param code The bundled output.
 * @param script Body writing a JSON result to stdout, run as an ES module.
 * @returns The parsed JSON the script wrote.
 * @throws When the child process fails.
 */
async function runInNode(code: string, script: string): Promise<unknown> {
	const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
		env: {
			...process.env,
			BUNDLE_URL: `data:text/javascript,${encodeURIComponent(code)}`,
		},
	});
	return JSON.parse(stdout);
}

/**
 * Bundles and evaluates `contents`, returning what it assigns to `module.exports`.
 *
 * @param contents Source of the entry point, treated as CommonJS.
 * @returns The exported value, which has to be JSON serializable.
 */
async function bundleAndEvaluate(contents: string): Promise<unknown> {
	return runInNode(
		await bundle(contents),
		`const { default: value } = await import(process.env.BUNDLE_URL);
		process.stdout.write(JSON.stringify(value));`
	);
}

describe("nodeBuiltinsPlugin", () => {
	test("converts `require` calls into a CommonJS virtual module", async () => {
		const code = await bundle(`module.exports = require("node:crypto");`);

		expect(getVirtualModule(code, "node:crypto")).toMatchInlineSnapshot(`
			"// node-builtins:node:crypto
			import * as mod from "node:crypto";
			var require_node_crypto = __commonJS({
			  "node-builtins:node:crypto"(exports, module) {
			    module.exports = mod.default ?? mod;
			  }
			});"
		`);

		// The virtual module must stay CommonJS: were it ESM, esbuild would wrap it with
		// `__toCommonJS` and `require` would see a copy of the named exports rather than the module.
		expect(code).not.toContain("__toCommonJS");
		expect(code).not.toContain("__esModule");
	});

	test("normalizes bare builtins to their `node:` prefixed form", async () => {
		const code = await bundle(`module.exports = require("crypto");`);

		expect(getVirtualModule(code, "node:crypto")).toContain(`import * as mod from "node:crypto";`);
		expect(code).not.toContain(`"crypto"`);
	});

	test("keeps imported builtins external", async () => {
		const code = await bundle(`import crypto from "crypto";\nexport default crypto.randomUUID;`);

		// Imports are provided by workerd, only `require` calls need the virtual module.
		expect(code).toContain(`import crypto from "node:crypto";`);
		expect(code).not.toContain("node-builtins");
	});

	test("ignores specifiers that are not builtins", async () => {
		const code = await bundle(`module.exports = require("not-a-builtin/crypto");`, {
			external: ["not-a-builtin/crypto"],
		});

		expect(code).not.toContain("node-builtins");
	});

	test("`require` returns the module itself", async () => {
		const code = await bundle(`module.exports = require("node:crypto");`);

		const result = await runInNode(
			code,
			`const { default: required } = await import(process.env.BUNDLE_URL);
			process.stdout.write(JSON.stringify({
				// The very module \`node:crypto\` provides, not a copy of its named exports:
				// a copy silently drops everything the named exports do not expose.
				isBuiltinModule: required === (await import("node:crypto")).default,
				// Node.js does not set \`__esModule\` on the result of \`require("node:crypto")\` either.
				hasEsModuleFlag: Object.hasOwn(required, "__esModule"),
			}));`
		);

		expect(result).toEqual({ isBuiltinModule: true, hasEsModuleFlag: false });
	});

	test("`require` interops with the middleware compiled by Next.js", async () => {
		// How the `import crypto from "node:crypto"` of a `proxy.ts` is compiled.
		const uuid = await bundleAndEvaluate(`
			function _interop_require_default(obj) {
				return obj && obj.__esModule ? obj : { default: obj };
			}
			const crypto = _interop_require_default(require("node:crypto"));
			module.exports = crypto.default.randomUUID();
		`);

		expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe("excludeInstrumentationOnlyFiles", () => {
	const serverDir = "/app/.open-next/middleware/.next/server";
	const files = [
		`${serverDir}/middleware.js`,
		`${serverDir}/instrumentation.js`,
		`${serverDir}/chunks/[turbopack]_runtime.js`,
		`${serverDir}/chunks/[externals]__1k9zbry._.js`,
		`${serverDir}/chunks/[root-of-the-server]__0ckz_qj._.js`,
		`${serverDir}/chunks/app_instrumentation_0mntc31.js`,
		`${serverDir}/chunks/shared_0a1b2c3._.js`,
		`${serverDir}/chunks/async_proxy_chunk._.js`,
	];
	const middlewareTrace = [
		"../../node_modules/next/dist/server/foo.js",
		"./chunks/[externals]__1k9zbry._.js",
		"./chunks/[root-of-the-server]__0ckz_qj._.js",
		"./chunks/[turbopack]_runtime.js",
		"./chunks/shared_0a1b2c3._.js",
	];
	const instrumentationTrace = [
		"../../node_modules/next/dist/server/foo.js",
		"./chunks/[turbopack]_runtime.js",
		"./chunks/app_instrumentation_0mntc31.js",
		"./chunks/shared_0a1b2c3._.js",
	];
	const noRefs = () => "";

	/**
	 * Returns a `readFile` callback serving `contents`, keyed by the path relative to the server dir.
	 */
	function readFrom(contents: Record<string, string>) {
		return (file: string) => contents[path.relative(serverDir, file)] ?? "";
	}

	test("removes the files only traced for the instrumentation hook", () => {
		expect(
			excludeInstrumentationOnlyFiles(files, serverDir, middlewareTrace, instrumentationTrace, noRefs)
		).toEqual([
			`${serverDir}/middleware.js`,
			`${serverDir}/chunks/[turbopack]_runtime.js`,
			`${serverDir}/chunks/[externals]__1k9zbry._.js`,
			`${serverDir}/chunks/[root-of-the-server]__0ckz_qj._.js`,
			// Traced for both: kept.
			`${serverDir}/chunks/shared_0a1b2c3._.js`,
			// Not traced for the middleware (e.g. an `await import()`): kept.
			`${serverDir}/chunks/async_proxy_chunk._.js`,
		]);
	});

	test("always keeps the middleware and the runtime", () => {
		const result = excludeInstrumentationOnlyFiles(
			files,
			serverDir,
			[],
			["./middleware.js", "./chunks/[turbopack]_runtime.js"],
			noRefs
		);
		expect(result).toContain(`${serverDir}/middleware.js`);
		expect(result).toContain(`${serverDir}/chunks/[turbopack]_runtime.js`);
		expect(result).not.toContain(`${serverDir}/instrumentation.js`);
	});

	test("resolves `..` entries back into the server dir", () => {
		const result = excludeInstrumentationOnlyFiles(
			files,
			serverDir,
			middlewareTrace,
			["../server/chunks/app_instrumentation_0mntc31.js"],
			noRefs
		);
		expect(result).not.toContain(`${serverDir}/chunks/app_instrumentation_0mntc31.js`);
		expect(result).toHaveLength(files.length - 2);
	});

	test("handles Windows-style separators in the traces", () => {
		const result = excludeInstrumentationOnlyFiles(
			files,
			serverDir,
			[".\\chunks\\shared_0a1b2c3._.js"],
			[".\\chunks\\app_instrumentation_0mntc31.js", ".\\chunks\\shared_0a1b2c3._.js"],
			noRefs
		);
		expect(result).not.toContain(`${serverDir}/chunks/app_instrumentation_0mntc31.js`);
		expect(result).toContain(`${serverDir}/chunks/shared_0a1b2c3._.js`);
	});

	test("keeps all the files when the instrumentation trace is missing", () => {
		expect(excludeInstrumentationOnlyFiles(files, serverDir, middlewareTrace, undefined, noRefs)).toEqual(
			files
		);
	});

	test("keeps all the files when the middleware trace is missing", () => {
		expect(
			excludeInstrumentationOnlyFiles(files, serverDir, undefined, instrumentationTrace, noRefs)
		).toEqual(files);
	});

	test("keeps an instrumentation only chunk loaded by a kept chunk", () => {
		// The shared chunk is traced for the instrumentation hook but not for the middleware.
		const result = excludeInstrumentationOnlyFiles(
			files,
			serverDir,
			middlewareTrace.filter((file) => !file.includes("shared")),
			instrumentationTrace,
			readFrom({
				"chunks/[root-of-the-server]__0ckz_qj._.js": `e.v(r=>Promise.all(["server/chunks/shared_0a1b2c3._.js"].map(r=>e.l(r))))`,
			})
		);
		expect(result).toContain(`${serverDir}/chunks/shared_0a1b2c3._.js`);
		expect(result).not.toContain(`${serverDir}/chunks/app_instrumentation_0mntc31.js`);
		expect(result).not.toContain(`${serverDir}/instrumentation.js`);
	});

	test("follows the references transitively through the candidates", () => {
		const result = excludeInstrumentationOnlyFiles(
			files,
			serverDir,
			middlewareTrace.filter((file) => !file.includes("shared")),
			instrumentationTrace,
			readFrom({
				"middleware.js": `R.c("server/chunks/shared_0a1b2c3._.js")`,
				"chunks/shared_0a1b2c3._.js": `R.c("server/chunks/app_instrumentation_0mntc31.js")`,
			})
		);
		expect(result).toContain(`${serverDir}/chunks/shared_0a1b2c3._.js`);
		expect(result).toContain(`${serverDir}/chunks/app_instrumentation_0mntc31.js`);
	});

	test("does not keep the instrumentation entry when its name is mentioned", () => {
		const result = excludeInstrumentationOnlyFiles(
			files,
			serverDir,
			middlewareTrace,
			instrumentationTrace,
			readFrom({
				"chunks/[root-of-the-server]__0ckz_qj._.js": `require(path.join(distDir, "server/instrumentation.js")); "instrumentation.js"; "app_instrumentation_0mntc31.js"`,
			})
		);
		expect(result).not.toContain(`${serverDir}/instrumentation.js`);
		// Only the full chunk path counts as a reference, not the file name.
		expect(result).not.toContain(`${serverDir}/chunks/app_instrumentation_0mntc31.js`);
	});
});

describe("readNftTrace", () => {
	const tracePath = "/app/.next/server/middleware.js.nft.json";

	afterEach(() => {
		mockFs.restore();
		vi.restoreAllMocks();
	});

	test("returns the traced files", () => {
		mockFs({ [tracePath]: JSON.stringify({ version: 1, files: ["./chunks/a.js", 1, "./chunks/b.js"] }) });
		expect(readNftTrace(tracePath)).toEqual(["./chunks/a.js", "./chunks/b.js"]);
	});

	test("returns undefined without a warning when the trace is missing", () => {
		mockFs({});
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		expect(readNftTrace(tracePath)).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
	});

	test.each([
		["invalid JSON", "{"],
		["non-array `files`", JSON.stringify({ files: "./chunks/a.js" })],
	])("returns undefined and warns on %s", (_, contents) => {
		mockFs({ [tracePath]: contents });
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		expect(readNftTrace(tracePath)).toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
	});
});
