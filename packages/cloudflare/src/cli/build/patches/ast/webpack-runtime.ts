/**
 * Inline dynamic requires in the webpack runtime.
 *
 * The webpack runtime has dynamic requires that would not be bundled by ESBuild:
 *
 *     installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
 *
 *  This patch unrolls the dynamic require for all the existing chunks:
 *
 *  For multiple chunks:
 *     switch (chunkId) {
 *       case ID1: installChunk(require("./chunks/ID1"); break;
 *       case ID2: installChunk(require("./chunks/ID2"); break;
 *       // ...
 *       case SELF_ID: installedChunks[chunkId] = 1; break;
 *       default: throw new Error(`Unknown chunk ${chunkId}`);
 *     }
 *
 * For a single chunk:
 *     require("./chunks/CHUNK_ID.js");
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { patchCode } from "./util.js";

// Inline the code when there are multiple chunks
export function buildMultipleChunksRule(chunks: number[]) {
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

// Inline the code when there is a single chunk.
// For example when there is a single Pages API route.
export const singleChunkRule = `
rule:
  pattern: ($CHUNK_ID, $_PROMISES) => { $$$ }
  inside: {pattern: $_.$_.require = $$$_, stopBy: end}
  all:
    - has: {pattern: $INSTALL(require("./chunks/" + $$$)), stopBy: end}
    - has: {pattern: $SELF_ID == $CHUNK_ID, stopBy: end}
    - has: {pattern: "$INSTALLED_CHUNK[$CHUNK_ID] = 1", stopBy: end}
fix: |
  ($CHUNK_ID, _) => {
    if (!$INSTALLED_CHUNK[$CHUNK_ID]) {
      $INSTALL(require("./chunks/$SELF_ID.js"));
      $INSTALLED_CHUNK[$CHUNK_ID] = 1;
    }
  }
`;

/**
 * Fixes the webpack-runtime.js and webpack-api-runtime.js files by inlining
 * the webpack dynamic requires.
 */
export async function patchWebpackRuntime(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const dotNextServerDir = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next/server"
  );

  // Look for all the chunks.
  const chunks = readdirSync(join(dotNextServerDir, "chunks"))
    .filter((chunk) => /^\d+\.js$/.test(chunk))
    .map((chunk) => {
      return Number(chunk.replace(/\.js$/, ""));
    });

  const runtimeFile = join(dotNextServerDir, "webpack-runtime.js");
  if (existsSync(runtimeFile)) {
    let code = readFileSync(runtimeFile, "utf-8");
    code = patchCode(code, buildMultipleChunksRule(chunks));
    code = patchCode(code, singleChunkRule);
    writeFileSync(runtimeFile, code);
  }

  const apiRuntimeFile = join(dotNextServerDir, "webpack-api-runtime.js");
  if (existsSync(apiRuntimeFile)) {
    let code = readFileSync(runtimeFile, "utf-8");
    code = patchCode(code, buildMultipleChunksRule(chunks));
    code = patchCode(code, singleChunkRule);
    writeFileSync(apiRuntimeFile, code);
  }
}
