import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyRule, parseCode, patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { buildChunkRequireRule, listChunks } from "./webpack-runtime.js";

describe("webpack runtime", () => {
	describe("buildChunkRequireRule", () => {
		test("patch runtime", () => {
			const code = `
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(658 != chunkId) {
/******/ 					installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
`;

			expect(patchCode(code, buildChunkRequireRule(["1.js", "named-chunk.js"]))).toMatchInlineSnapshot(`
				"/******/ 		// require() chunk loading for javascript
				/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
				/******/ 			// "1" is the signal for "already loaded"
				/******/ 			if(!installedChunks[chunkId]) {
				/******/ 				if(658 != chunkId) {
				/******/ 					installChunk(((path) => {
				  switch (path) {
				    case "./chunks/1.js": return require("./chunks/1.js");
				    case "./chunks/named-chunk.js": return require("./chunks/named-chunk.js");
				    default: throw new Error(\`Unknown chunk \${path}\`);
				  }
				})("./chunks/" + __webpack_require__.u(chunkId))
				);
				/******/ 				} else installedChunks[chunkId] = 1;
				/******/ 			}
				/******/ 		};
				"
			`);
		});

		test("patch minified runtime", () => {
			const code = `t.f.require=(o,n)=>{e[o]||(658!=o?r(require("./chunks/"+t.u(o))):e[o]=1)}`;

			expect(patchCode(code, buildChunkRequireRule(["1.js", "named-chunk.js"]))).toMatchInlineSnapshot(`
				"t.f.require=(o,n)=>{e[o]||(658!=o?r(((path) => {
				  switch (path) {
				    case "./chunks/1.js": return require("./chunks/1.js");
				    case "./chunks/named-chunk.js": return require("./chunks/named-chunk.js");
				    default: throw new Error(\`Unknown chunk \${path}\`);
				  }
				})("./chunks/" + t.u(o))
				):e[o]=1)}"
			`);
		});

		test("patch minified runtime with a single chunk", () => {
			const code = `o.f.require=(t,a)=>{e[t]||(710==t?r(require("./chunks/"+o.u(t))):e[t]=1)}`;

			expect(patchCode(code, buildChunkRequireRule(["named-chunk.js"]))).toMatchInlineSnapshot(`
				"o.f.require=(t,a)=>{e[t]||(710==t?r(((path) => {
				  switch (path) {
				    case "./chunks/named-chunk.js": return require("./chunks/named-chunk.js");
				    default: throw new Error(\`Unknown chunk \${path}\`);
				  }
				})("./chunks/" + o.u(t))
				):e[t]=1)}"
			`);
		});

		test("escape `$` in chunk names", () => {
			const code = `e.f.require=(c,d)=>{a[c]||(311!=c?b(require("./chunks/"+e.u(c))):a[c]=1)}`;

			expect(patchCode(code, buildChunkRequireRule(["$CHUNK_FILE.js"]))).toContain(
				`case "./chunks/\\x24CHUNK_FILE.js": return require("./chunks/\\x24CHUNK_FILE.js");`
			);
		});

		test("run the patched runtime", () => {
			const code = `
const installed = [];
const require = (path) => path;
const installChunk = (path) => installed.push(path);
const installedChunks = { 311: 0 };
const __webpack_require__ = { f: {} };
__webpack_require__.u = (chunkId) => "" + ({ 522: "named-chunk" }[chunkId] || chunkId) + ".js";
__webpack_require__.f.require = (chunkId, promises) => {
	if (!installedChunks[chunkId]) {
		if (311 != chunkId) {
			installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
		} else installedChunks[chunkId] = 1;
	}
};
`;
			const patched = patchCode(code, buildChunkRequireRule(["1.js", "named-chunk.js"]));
			const run = new Function(
				`${patched}
				__webpack_require__.f.require(1);
				__webpack_require__.f.require(522);
				__webpack_require__.f.require(311);
				let error;
				try { __webpack_require__.f.require(404); } catch (e) { error = e.message; }
				return { installed, installedChunks, error };`
			);

			expect(run()).toEqual({
				installed: ["./chunks/1.js", "./chunks/named-chunk.js"],
				installedChunks: { 311: 1 },
				error: "Unknown chunk ./chunks/404.js",
			});
		});

		test("do not match an already patched runtime", () => {
			const code = `t.f.require=(o,n)=>{e[o]||(658!=o?r(require("./chunks/"+t.u(o))):e[o]=1)}`;
			const patched = patchCode(code, buildChunkRequireRule(["1.js"]));

			expect(applyRule(buildChunkRequireRule(["1.js"]), parseCode(patched)).edits).toHaveLength(0);
		});
	});

	describe("listChunks", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = mkdtempSync(join(tmpdir(), "webpack-runtime-test-"));
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		test("list numeric, named and nested chunks", () => {
			mkdirSync(join(tmpDir, "dir"));
			for (const file of ["103.js", "9.js", "named-chunk.js", "named-chunk.js.map", "dir/nested-chunk.js"]) {
				writeFileSync(join(tmpDir, file), "");
			}

			expect(listChunks(tmpDir)).toEqual(["103.js", "9.js", "dir/nested-chunk.js", "named-chunk.js"]);
		});

		test("return an empty list when there is no chunks folder", () => {
			expect(listChunks(join(tmpDir, "missing"))).toEqual([]);
		});
	});
});
