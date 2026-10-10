import { join } from "node:path";

import { applyRule, parseCode, patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, test } from "vitest";

import { buildMultipleChunksRule, buildSingleChunkRule, listChunks } from "./webpack-runtime.js";

describe("webpack runtime", () => {
	describe("multiple chunks", () => {
		test("patch runtime", () => {
			const code = `
          /******/ 		// require() chunk loading for javascript
          /******/ 		__webpack_require__.f.require = (chunkId, promises) => {
          /******/ 			// "1" is the signal for "already loaded"
          /******/ 			if (!installedChunks[chunkId]) {
          /******/ 				if (658 != chunkId) {
          /******/ 					installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
                      /******/
                  } else installedChunks[chunkId] = 1;
                  /******/
              }
              /******/
          };
      `;

			expect(patchCode(code, buildMultipleChunksRule(["1.js", "2.js", "3.js"]))).toMatchInlineSnapshot(`
				"/******/ 		// require() chunk loading for javascript
				          /******/ 		__webpack_require__.f.require = (chunkId, _) => {
				  if (!installedChunks[chunkId]) {
				    if (658 == chunkId) {
				      installedChunks[chunkId] = 1;
				    } else {
				      switch ("./chunks/" + __webpack_require__.u(chunkId)) {
				        case "./chunks/1.js": installChunk(require("./chunks/1.js")); break;
				        case "./chunks/2.js": installChunk(require("./chunks/2.js")); break;
				        case "./chunks/3.js": installChunk(require("./chunks/3.js")); break;
				        default: throw new Error(\`Unknown chunk \${chunkId}\`);
				      }
				    }
				  }
				}
				;
				      "
			`);
		});

		test("patch minified runtime", () => {
			const code = `
      t.f.require=(o,n)=>{e[o]||(658!=o?r(require("./chunks/"+t.u(o))):e[o]=1)}
      `;

			expect(patchCode(code, buildMultipleChunksRule(["1.js", "2.js", "3.js"]))).toMatchInlineSnapshot(`
				"t.f.require=(o, _) => {
				  if (!e[o]) {
				    if (658 == o) {
				      e[o] = 1;
				    } else {
				      switch ("./chunks/" + t.u(o)) {
				        case "./chunks/1.js": r(require("./chunks/1.js")); break;
				        case "./chunks/2.js": r(require("./chunks/2.js")); break;
				        case "./chunks/3.js": r(require("./chunks/3.js")); break;
				        default: throw new Error(\`Unknown chunk \${o}\`);
				      }
				    }
				  }
				}

				      "
			`);
		});

		test("patch runtime with named chunks", () => {
			const code = `
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and sibling chunks for the entrypoint
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + ({"522":"named-chunk","789":"dir/nested-chunk"}[chunkId] || chunkId) + ".js";
/******/ 		};
/******/ 	})();
/******/
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(311 != chunkId) {
/******/ 					installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
`;

			const patched = patchCode(
				code,
				buildMultipleChunksRule(["1.js", "2.js", "dir/nested-chunk.js", "named-chunk.js"])
			);

			expect(patched).toContain(
				`case "./chunks/named-chunk.js": installChunk(require("./chunks/named-chunk.js")); break;`
			);
			expect(patched).toContain(
				`case "./chunks/dir/nested-chunk.js": installChunk(require("./chunks/dir/nested-chunk.js")); break;`
			);
			expect(patched).not.toContain(`require("./chunks/" +`);
			expect(patched).toMatchInlineSnapshot(`
				"/******/ 	/* webpack/runtime/get javascript chunk filename */
				/******/ 	(() => {
				/******/ 		// This function allow to reference async chunks and sibling chunks for the entrypoint
				/******/ 		__webpack_require__.u = (chunkId) => {
				/******/ 			// return url for filenames based on template
				/******/ 			return "" + ({"522":"named-chunk","789":"dir/nested-chunk"}[chunkId] || chunkId) + ".js";
				/******/ 		};
				/******/ 	})();
				/******/
				/******/ 		// require() chunk loading for javascript
				/******/ 		__webpack_require__.f.require = (chunkId, _) => {
				  if (!installedChunks[chunkId]) {
				    if (311 == chunkId) {
				      installedChunks[chunkId] = 1;
				    } else {
				      switch ("./chunks/" + __webpack_require__.u(chunkId)) {
				        case "./chunks/1.js": installChunk(require("./chunks/1.js")); break;
				        case "./chunks/2.js": installChunk(require("./chunks/2.js")); break;
				        case "./chunks/dir/nested-chunk.js": installChunk(require("./chunks/dir/nested-chunk.js")); break;
				        case "./chunks/named-chunk.js": installChunk(require("./chunks/named-chunk.js")); break;
				        default: throw new Error(\`Unknown chunk \${chunkId}\`);
				      }
				    }
				  }
				}
				;
				"
			`);
		});

		test("patch minified runtime with named chunks", () => {
			const code = `
e.u=a=>""+({522:"named-chunk",789:"other-chunk"}[a]||a)+".js",e.o=(a,b)=>Object.prototype.hasOwnProperty.call(a,b),e.f.require=(c,d)=>{a[c]||(311!=c?b(require("./chunks/"+e.u(c))):a[c]=1)},module.exports=e
`;

			const patched = patchCode(
				code,
				buildMultipleChunksRule(["1.js", "2.js", "named-chunk.js", "other-chunk.js"])
			);

			expect(patched).toContain(
				`case "./chunks/named-chunk.js": b(require("./chunks/named-chunk.js")); break;`
			);
			expect(patched).toContain(
				`case "./chunks/other-chunk.js": b(require("./chunks/other-chunk.js")); break;`
			);
			expect(patched).not.toContain(`require("./chunks/"+`);
			expect(patched).toMatchInlineSnapshot(`
				"e.u=a=>""+({522:"named-chunk",789:"other-chunk"}[a]||a)+".js",e.o=(a,b)=>Object.prototype.hasOwnProperty.call(a,b),e.f.require=(c, _) => {
				  if (!a[c]) {
				    if (311 == c) {
				      a[c] = 1;
				    } else {
				      switch ("./chunks/" + e.u(c)) {
				        case "./chunks/1.js": b(require("./chunks/1.js")); break;
				        case "./chunks/2.js": b(require("./chunks/2.js")); break;
				        case "./chunks/named-chunk.js": b(require("./chunks/named-chunk.js")); break;
				        case "./chunks/other-chunk.js": b(require("./chunks/other-chunk.js")); break;
				        default: throw new Error(\`Unknown chunk \${c}\`);
				      }
				    }
				  }
				}
				,module.exports=e
				"
			`);
		});

		test("escapes `$` in chunk names so that placeholders are not substituted", () => {
			const code = `
e.u=a=>""+({522:"$INSTALL"}[a]||a)+".js",e.f.require=(c,d)=>{a[c]||(311!=c?b(require("./chunks/"+e.u(c))):a[c]=1)}
`;

			const patched = patchCode(code, buildMultipleChunksRule(["1.js", "$INSTALL.js"]));

			expect(patched).toContain(
				`case "./chunks/\\x24INSTALL.js": b(require("./chunks/\\x24INSTALL.js")); break;`
			);
			expect(patched).not.toContain(`./chunks/b.js`);
			// The escaped path is the same string at runtime
			expect(new Function(`return "./chunks/\\x24INSTALL.js"`)()).toBe("./chunks/$INSTALL.js");
		});

		test("runs the patched runtime", () => {
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
			const patched = patchCode(code, buildMultipleChunksRule(["1.js", "named-chunk.js"]));
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
				error: "Unknown chunk 404",
			});
		});
	});

	describe("single chunk", () => {
		test("patch runtime", () => {
			const code = `
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(710 == chunkId) {
/******/ 					installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
`;

			expect(patchCode(code, buildSingleChunkRule(["710.js"]))).toMatchInlineSnapshot(`
				"/******/ 		// require() chunk loading for javascript
				/******/ 		__webpack_require__.f.require = (chunkId, _) => {
				  if (!installedChunks[chunkId]) {
				    if (710 == chunkId) {
				      switch ("./chunks/" + __webpack_require__.u(chunkId)) {
				        case "./chunks/710.js": installChunk(require("./chunks/710.js")); break;
				        default: break;
				      }
				    } else {
				      installedChunks[chunkId] = 1;
				    }
				  }
				}
				;
				"
			`);
		});

		test("patch minified runtime", () => {
			const code = `
      o.f.require=(t,a)=>{e[t]||(710==t?r(require("./chunks/"+o.u(t))):e[t]=1)}
      `;

			expect(patchCode(code, buildSingleChunkRule(["710.js"]))).toMatchInlineSnapshot(`
				"o.f.require=(t, _) => {
				  if (!e[t]) {
				    if (710 == t) {
				      switch ("./chunks/" + o.u(t)) {
				        case "./chunks/710.js": r(require("./chunks/710.js")); break;
				        default: break;
				      }
				    } else {
				      e[t] = 1;
				    }
				  }
				}

				      "
			`);
		});

		test("patch minified runtime with a named chunk", () => {
			const code = `
      o.u=t=>""+(710===t?"named-chunk":t)+".js",o.f.require=(t,a)=>{e[t]||(710==t?r(require("./chunks/"+o.u(t))):e[t]=1)}
      `;

			const patched = patchCode(code, buildSingleChunkRule(["named-chunk.js"]));

			expect(patched).toContain(
				`case "./chunks/named-chunk.js": r(require("./chunks/named-chunk.js")); break;`
			);
			expect(patched).not.toContain(`require("./chunks/"+`);
		});
	});

	test("rules do not match an already patched runtime", () => {
		const code = `t.f.require=(o,n)=>{e[o]||(658!=o?r(require("./chunks/"+t.u(o))):e[o]=1)}`;
		const patched = patchCode(code, buildMultipleChunksRule(["1.js", "named-chunk.js"]));

		expect(applyRule(buildMultipleChunksRule(["1.js"]), parseCode(patched)).edits).toHaveLength(0);
		expect(applyRule(buildSingleChunkRule(["1.js"]), parseCode(patched)).edits).toHaveLength(0);
	});

	test("rules only match their own runtime shape", () => {
		const multiple = `t.f.require=(o,n)=>{e[o]||(658!=o?r(require("./chunks/"+t.u(o))):e[o]=1)}`;
		const single = `o.f.require=(t,a)=>{e[t]||(710==t?r(require("./chunks/"+o.u(t))):e[t]=1)}`;

		expect(applyRule(buildSingleChunkRule(["1.js"]), parseCode(multiple)).edits).toHaveLength(0);
		expect(applyRule(buildMultipleChunksRule(["1.js"]), parseCode(single)).edits).toHaveLength(0);
	});

	describe("listChunks", () => {
		afterEach(() => mockFs.restore());

		test("lists numeric, named and nested chunks", () => {
			const chunksDir = join("/", ".next", "server", "chunks");
			mockFs({
				[chunksDir]: {
					"103.js": "",
					"named-chunk.js": "",
					"named-chunk.js.map": "",
					"9.js": "",
					dir: { "nested-chunk.js": "" },
				},
			});

			expect(listChunks(chunksDir)).toEqual(["103.js", "9.js", "dir/nested-chunk.js", "named-chunk.js"]);
		});

		test("returns an empty list when there is no chunks folder", () => {
			mockFs({});

			expect(listChunks(join("/", "missing"))).toEqual([]);
		});
	});
});
