import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import {
	loadWasmChunkFn,
	patchTurbopackRuntime,
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
