import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import {
	loadWasmChunkFn,
	replaceLoadWebAssemblyModuleRule,
	replaceLoadWebAssemblyRule,
} from "./turbopack.js";

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

	test("does not rewrite when no matching function is present", () => {
		const code = `
function someUnrelatedFn() {
    return 42;
}
`;
		const out = patchCode(code, replaceLoadWebAssemblyModuleRule);
		expect(out).toContain("someUnrelatedFn");
		expect(out).not.toContain("loadWasmChunk");
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

	test("does not rewrite when no matching function is present", () => {
		const code = `
function loadWebAssemblyModule(chunkPath, _edgeModule) {
    return compileWebAssemblyFromPath(chunkPath);
}
`;
		const out = patchCode(code, replaceLoadWebAssemblyRule);
		expect(out).toContain("compileWebAssemblyFromPath");
		expect(out).not.toContain("loadWasmChunk");
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
			      case "server/chunks/ssr/foo_bg_abc123_.wasm": return (await import("/abs/proj/.next/server/chunks/ssr/foo_bg_abc123_.wasm?module")).default;
			      case "server/chunks/ssr/bar_bg_def456_.wasm": return (await import("/abs/proj/.next/server/chunks/ssr/bar_bg_def456_.wasm?module")).default;
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
