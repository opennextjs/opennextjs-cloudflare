/**
 * Inline dynamic requires in the webpack runtime.
 *
 * The webpack runtime has dynamic requires that would not be bundled by ESBuild:
 *
 *     installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
 *
 *  This patch unrolls the dynamic require for all the existing chunks:
 *
 *     switch (chunkId) {
 *       case ID1: installChunk(require("./chunks/ID1"); break;
 *       case ID2: installChunk(require("./chunks/ID2"); break;
 *       // ...
 *       case SELF_ID: installedChunks[chunkId] = 1; break;
 *       default: throw new Error(`Unknown chunk ${chunkId}`);
 *     }
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { patchCode } from "./util.js";

export function buildInlineChunksRule(chunks: number[]) {
  return `
rule:
  pattern: ($CHUNK_ID, $_PROMISES) => { $$$ }
  inside: {pattern: $_.$_.require = $$$_, stopBy: end}
  all:
    - has: {pattern: $INSTALL(require("./chunks/" + $$$)), stopBy: end}
    - has: {pattern: $SELF_ID != $CHUNK_ID, stopBy: end}
    - has: {pattern: "$INSTALLED_CHUNK[$CHUNK_ID] = 1", stopBy: end}
fix: |
  ($CHUNK_ID, _) => {
    if (!$INSTALLED_CHUNK[$CHUNK_ID]) {
      switch ($CHUNK_ID) {
${chunks.map((chunk) => `         case ${chunk}: $INSTALL(require("./chunks/${chunk}.js")); break;`).join("\n")}
         case $SELF_ID: $INSTALLED_CHUNK[$CHUNK_ID] = 1; break;
         default: throw new Error(\`Unknown chunk \${$CHUNK_ID}\`);
      }
    }
  }`;
}

/**
 * Fixes the webpack-runtime.js file by removing its webpack dynamic requires.
 */
export async function patchWebpackRuntime(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const dotNextServerDir = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next/server"
  );

  const runtimeFile = join(dotNextServerDir, "webpack-runtime.js");
  const runtimeCode = readFileSync(runtimeFile, "utf-8");
  // Look for all the chunks.
  const chunks = readdirSync(join(dotNextServerDir, "chunks"))
    .filter((chunk) => /^\d+\.js$/.test(chunk))
    .map((chunk) => {
      return Number(chunk.replace(/\.js$/, ""));
    });

  writeFileSync(runtimeFile, patchCode(runtimeCode, buildInlineChunksRule(chunks)));
}
