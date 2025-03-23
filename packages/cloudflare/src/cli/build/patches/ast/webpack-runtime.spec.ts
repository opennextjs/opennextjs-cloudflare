import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import { buildMultipleChunksRule, singleChunkRule } from "./webpack-runtime.js";

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

      expect(patchCode(code, buildMultipleChunksRule([1, 2, 3]))).toMatchInlineSnapshot(`
        "/******/ 		// require() chunk loading for javascript
                  /******/ 		__webpack_require__.f.require = (chunkId, _) => {
          if (!installedChunks[chunkId]) {
            switch (chunkId) {
               case 1: installChunk(require("./chunks/1.js")); break;
               case 2: installChunk(require("./chunks/2.js")); break;
               case 3: installChunk(require("./chunks/3.js")); break;
               case 658: installedChunks[chunkId] = 1; break;
               default: throw new Error(\`Unknown chunk \${chunkId}\`);
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

      expect(patchCode(code, buildMultipleChunksRule([1, 2, 3]))).toMatchInlineSnapshot(
        `
        "t.f.require=(o, _) => {
          if (!e[o]) {
            switch (o) {
               case 1: r(require("./chunks/1.js")); break;
               case 2: r(require("./chunks/2.js")); break;
               case 3: r(require("./chunks/3.js")); break;
               case 658: e[o] = 1; break;
               default: throw new Error(\`Unknown chunk \${o}\`);
            }
          }
        }

              "
      `
      );
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

      expect(patchCode(code, singleChunkRule)).toMatchInlineSnapshot(`
        "/******/ 		// require() chunk loading for javascript
        /******/ 		__webpack_require__.f.require = (chunkId, _) => {
          if (!installedChunks[chunkId]) {
            try {
              installChunk(require("./chunks/710.js"));
            } catch {}
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

      expect(patchCode(code, singleChunkRule)).toMatchInlineSnapshot(`
        "o.f.require=(t, _) => {
          if (!e[t]) {
            try {
              r(require("./chunks/710.js"));
            } catch {}
          }
        }

              "
      `);
    });
  });
});
