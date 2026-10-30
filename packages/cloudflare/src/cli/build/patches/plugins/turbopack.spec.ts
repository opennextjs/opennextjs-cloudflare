import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
	loadWasmChunkFn,
	packageNameFromSymlinkTarget,
	patchTurbopackRuntime,
	patchTurbopackRuntimeCode,
	patchTurbopackWasmChunkCode,
	replaceCompileModuleRule,
	replaceInstantiateModuleRule,
	replaceLoadWebAssemblyModuleRule,
	replaceLoadWebAssemblyRule,
} from "./turbopack.js";

describe("patchTurbopackRuntime", () => {
	test("normalizes Windows paths before generating chunk loaders", async () => {
		const patch = patchTurbopackRuntime.patches[0];
		const code = "function loadRuntimeChunkPath() {}";

		const patched = await patch.patchCode({
			code,
			filePath: String.raw`C:\project\.open-next\server-functions\default\.next\server\chunks\ssr\[turbopack]_runtime.js`,
			tracedFiles: [
				String.raw`C:\project\.open-next\server-functions\default\.next\server\chunks\ssr\route.js`,
				String.raw`C:\project\.open-next\server-functions\default\.next\server\chunks\ssr\module.wasm`,
			],
			manifests: {} as never,
			buildOptions: {} as never,
		});

		expect(patched).toContain(
			'case "server/chunks/ssr/route.js": return require("C:/project/.open-next/server-functions/default/.next/server/chunks/ssr/route.js");'
		);
		expect(patched).toContain(
			'case "server/chunks/ssr/module.wasm": return (await import("C:/project/.open-next/server-functions/default/.next/server/chunks/ssr/module.wasm")).default;'
		);
	});
});

describe("replaceLoadWebAssemblyModuleRule", () => {
	test("rewrites Turbopack's loadWebAssemblyModule body", () => {
		const code = `
function loadWebAssemblyModule(chunkPath, _edgeModule) {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
    return compileWebAssemblyFromPath(resolved);
}
`;
		expect(patchCode(code, replaceLoadWebAssemblyModuleRule)).toMatchInlineSnapshot(`
			"function loadWebAssemblyModule(chunkPath, _edgeModule) {
			  return loadWasmChunk(chunkPath);
			}
			"
		`);
	});
});

describe("replaceLoadWebAssemblyRule", () => {
	test("rewrites Turbopack's loadWebAssembly body", () => {
		const code = `
function loadWebAssembly(chunkPath, _edgeModule, imports) {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
    return instantiateWebAssemblyFromPath(resolved, imports);
}
`;
		expect(patchCode(code, replaceLoadWebAssemblyRule)).toMatchInlineSnapshot(`
			"async function loadWebAssembly(chunkPath, _edgeModule, imports) {
			  const mod = await loadWasmChunk(chunkPath);
			  const { exports } = await WebAssembly.instantiate(mod, imports);
			  return exports;
			}
			"
		`);
	});
});

describe("replaceCompileModuleRule", () => {
	test("rewrites the `compileModule` helper emitted by Next 16.3", () => {
		const code = `
async function compileModule(chunkPath) {
    const response = readWebAssemblyAsResponse(chunkPath);
    return await WebAssembly.compileStreaming(response);
}
`;
		expect(patchCode(code, replaceCompileModuleRule)).toMatchInlineSnapshot(`
			"async function compileModule(chunkPath) {
			  return loadWasmChunk(chunkPath);
			}
			"
		`);
	});

	// Verbatim emission of `[turbopack-wasm]/node/loadWasm.ts` in a Next 16.3.3 chunk.
	test("rewrites the minified `compileModule` helper", () => {
		const code = `module.exports=[22734,(a,b,c)=>{b.exports=a.x("fs",()=>require("fs"))},88947,(a,b,c)=>{b.exports=a.x("stream",()=>require("stream"))},6876,a=>{"use strict";async function b(b){let c=function(b){let{createReadStream:c}=a.r(22734),{Readable:d}=a.r(88947),e=c(function(b){let{resolve:c}=a.r(14747);return c(a.w,b)}(b));return new Response(d.toWeb(e),{headers:{"content-type":"application/wasm"}})}(b);return await WebAssembly.compileStreaming(c)}a.s(["compileModule",0,b])},66545,function(a){a.q("server/chunks/ssr/query_compiler_bg.wasm")}];`;

		const patched = patchCode(code, replaceCompileModuleRule);

		expect(patched).not.toContain("WebAssembly.compileStreaming");
		expect(patched).toContain("async function b(b) {\n  return loadWasmChunk(b);\n}");
		// The chunk path registration is left untouched.
		expect(patched).toContain('a.q("server/chunks/ssr/query_compiler_bg.wasm")');
	});
});

describe("replaceInstantiateModuleRule", () => {
	test("rewrites the `instantiate` helper emitted by Next 16.3", () => {
		const code = `
async function instantiate(chunkPath, imports) {
    const response = readWebAssemblyAsResponse(chunkPath);
    const { instance } = await WebAssembly.instantiateStreaming(response, imports);
    return instance.exports;
}
`;
		expect(patchCode(code, replaceInstantiateModuleRule)).toMatchInlineSnapshot(`
			"async function instantiate(chunkPath, imports) {
			  const module = await loadWasmChunk(chunkPath);
			  const { exports } = await WebAssembly.instantiate(module, imports);
			  return exports;
			}
			"
		`);
	});
});

describe("patchTurbopackWasmChunkCode", () => {
	const tracedFiles = [
		"/abs/proj/.next/server/chunks/ssr/query_compiler_bg.wasm",
		"/abs/proj/.next/server/chunks/ssr/chunk.js",
	];

	test("appends `loadWasmChunk` when a wasm helper was rewritten", () => {
		const code = `
async function compileModule(chunkPath) {
    const response = readWebAssemblyAsResponse(chunkPath);
    return await WebAssembly.compileStreaming(response);
}
`;
		const patched = patchTurbopackWasmChunkCode({ code, tracedFiles });

		expect(patched).toContain("return loadWasmChunk(chunkPath);");
		expect(patched).toContain(
			'case "server/chunks/ssr/query_compiler_bg.wasm": return (await import("/abs/proj/.next/server/chunks/ssr/query_compiler_bg.wasm")).default;'
		);
	});

	test("leaves the chunk untouched when no wasm helper matches", () => {
		// `WebAssembly.compileStreaming` is only referenced behind a feature detection,
		// as libraries shipping their own wasm loader do.
		const code = `
const compile = typeof WebAssembly.compileStreaming === "function" ? WebAssembly.compileStreaming : compileFallback;
`;
		expect(patchTurbopackWasmChunkCode({ code, tracedFiles })).toBe(code);
	});
});

describe("loadWasmChunkFn", () => {
	test("emits a switch case per .wasm entry, keyed by the .next-relative path", () => {
		const tracedFiles = [
			"/abs/proj/.next/server/chunks/ssr/foo_bg_abc123_.wasm",
			"/abs/proj/.next/server/chunks/ssr/bar_bg_def456_.wasm",
			"/abs/proj/.next/server/chunks/ssr/some-non-wasm.js",
		];
		expect(loadWasmChunkFn(tracedFiles)).toMatchInlineSnapshot(`
			"
			  async function loadWasmChunk(chunkPath) {
			    switch (chunkPath) {
			      case "server/chunks/ssr/foo_bg_abc123_.wasm": return (await import("/abs/proj/.next/server/chunks/ssr/foo_bg_abc123_.wasm")).default;
			      case "server/chunks/ssr/bar_bg_def456_.wasm": return (await import("/abs/proj/.next/server/chunks/ssr/bar_bg_def456_.wasm")).default;
			      default:
			        throw new Error(\`Unknown wasm chunk: \${chunkPath}\`);
			    }
			  }
			"
		`);
	});

	test("emits only the default branch when no wasm entries are traced", () => {
		expect(loadWasmChunkFn(["/abs/proj/.next/server/chunks/ssr/non-wasm.js"])).toMatchInlineSnapshot(`
			"
			  async function loadWasmChunk(chunkPath) {
			    switch (chunkPath) {

			      default:
			        throw new Error(\`Unknown wasm chunk: \${chunkPath}\`);
			    }
			  }
			"
		`);
	});
});

describe("packageNameFromSymlinkTarget", () => {
	test.each([
		["../../node_modules/shiki", "shiki"],
		["../../../../node_modules/.pnpm/pg@8.23.1/node_modules/pg", "pg"],
		["../../../../node_modules/.pnpm/@scope+name@1.0.0/node_modules/@scope/name", "@scope/name"],
		["C:\\project\\node_modules\\.pnpm\\x@1.0.0\\node_modules\\x\\", "x"],
	])("maps %s to %s", (target, expected) => {
		expect(packageNameFromSymlinkTarget(target)).toBe(expected);
	});

	test.each([["../../packages/lib"], ["../../node_modules/"], ["my_node_modules/x"]])(
		"returns undefined for %s",
		(target) => {
			expect(packageNameFromSymlinkTarget(target)).toBeUndefined();
		}
	);
});

const externalImportRuntime = `
function loadRuntimeChunkPath() {}
async function externalImport(id) {
  let raw;
  raw = await import(id);
  return raw;
}
contextPrototype.y = externalImport;
`;

describe("Turbopack externals", () => {
	let tmpDir: string;
	// `<tmpDir>/app/.next`, `<tmpDir>` being the root of the monorepo.
	let dotNextDir: string;
	let runtimePath: string;

	/**
	 * Create the Turbopack link `.next/node_modules/<name>` -> `target`, and the linked package.
	 *
	 * @param name Name of the link, i.e. the hashed id.
	 * @param target Target of the link, relative to `.next/node_modules`.
	 * @param files Files of the linked package, `undefined` for a dangling link.
	 */
	function link(name: string, target: string, files?: Record<string, string>) {
		const linksDir = path.join(dotNextDir, "node_modules");
		if (files) {
			const dir = path.resolve(linksDir, target);
			fs.mkdirSync(dir, { recursive: true });
			for (const [file, content] of Object.entries(files)) {
				fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
				fs.writeFileSync(path.join(dir, file), content);
			}
		}
		fs.mkdirSync(linksDir, { recursive: true });
		fs.symlinkSync(target, path.join(linksDir, name), "dir");
	}

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbopack-externals-"));
		dotNextDir = path.join(tmpDir, "app/.next");
		runtimePath = path.join(dotNextDir, "server/chunks/ssr/[turbopack]_runtime.js");
		fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("maps live links to their hashed id and dangling links to the package name", () => {
		// pnpm, unscoped
		link("pg-abc123", "../../../node_modules/.pnpm/pg@8.23.1/node_modules/pg", {
			"package.json": '{"name":"pg"}',
		});
		// pnpm, scoped
		link("scoped-def456", "../../../node_modules/.pnpm/@scope+name@1.0.0/node_modules/@scope/name", {
			"package.json": '{"name":"@scope/name"}',
		});
		// npm / yarn classic
		link("shiki-789", "../../node_modules/shiki", { "package.json": '{"name":"shiki"}' });
		// workspace package, outside of any `node_modules` folder
		link("ws-lib-222", "../../../packages/ws-lib", { "package.json": '{"name":"@acme/ws-lib"}' });
		// dangling links
		link("broken-111", "../../../node_modules/.pnpm/does-not-exist@1.0.0/node_modules/does-not-exist");
		link("broken-no-name-333", "../../../packages/no-name");

		const patched = patchTurbopackRuntimeCode({
			code: externalImportRuntime,
			filePath: runtimePath,
			tracedFiles: [],
		}).replace(/\s+/g, " ");

		const expectCase = (id: string, specifier: string) =>
			expect(patched).toContain(`case "${id}": raw = await import("${specifier}"); break;`);

		expectCase("pg-abc123", "pg-abc123");
		expectCase("scoped-def456", "scoped-def456");
		expectCase("shiki-789", "shiki-789");
		expectCase("ws-lib-222", "ws-lib-222");
		// A dangling link is mapped from its target path, so that the package can be resolved from the app.
		expectCase("broken-111", "does-not-exist");

		expect(patched).not.toContain('case "broken-no-name-333"');
		expect(patched).not.toContain("node_modules");
	});

	// See https://github.com/opennextjs/opennextjs-cloudflare/issues/1409
	test("bundles the `workerd` exports of a package linked from the pnpm store", async () => {
		// `postgres` is not a direct dependency of the app: it is only reachable through the link.
		link("postgres-abc", "../../../node_modules/.pnpm/postgres@3.4.7/node_modules/postgres", {
			"package.json": JSON.stringify({
				name: "postgres",
				main: "cjs/src/index.js",
				exports: {
					".": { workerd: "./cf/src/index.js", default: "./cjs/src/index.js" },
					"./sub": { workerd: "./cf/src/sub.js", default: "./cjs/src/sub.js" },
				},
			}),
			"cf/src/index.js": 'export default "index-for-workerd";',
			"cf/src/sub.js": 'export default "sub-for-workerd";',
			"cjs/src/index.js": 'export default "index-for-node";',
			"cjs/src/sub.js": 'export default "sub-for-node";',
		});

		// Subpath imports are discovered from the `[externals]` chunks.
		const externalsChunk = path.join(dotNextDir, "server/chunks/ssr/[externals]_postgres.js");
		fs.writeFileSync(externalsChunk, 'e.y("postgres-abc/sub");');

		const code = `${externalImportRuntime}
export const index = externalImport("postgres-abc");
export const sub = externalImport("postgres-abc/sub");
`;
		fs.writeFileSync(
			runtimePath,
			patchTurbopackRuntimeCode({ code, filePath: runtimePath, tracedFiles: [externalsChunk] })
		);

		const result = await build({
			entryPoints: [runtimePath],
			bundle: true,
			write: false,
			format: "esm",
			platform: "node",
			conditions: ["workerd"],
			// The `@vercel/og` case is always generated, `next` is not installed in the fixture.
			external: ["next/*"],
			logLevel: "silent",
		});
		const output = result.outputFiles[0]!.text;

		expect(output).toContain("index-for-workerd");
		expect(output).toContain("sub-for-workerd");
		expect(output).not.toContain("for-node");
	});
});
