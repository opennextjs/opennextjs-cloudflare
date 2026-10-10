/**
 * Inline dynamic requires in the webpack runtime.
 *
 * The webpack runtime has dynamic requires that would not be bundled by ESBuild:
 *
 *     installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
 *
 * `__webpack_require__.u` maps a chunk id to its file name. Next.js uses `chunkFilename: "[name].js"` for the
 * server, so the file is `<id>.js` by default but `<name>.js` for a named chunk (i.e. `webpackChunkName`):
 *
 *     __webpack_require__.u = (chunkId) => "" + ({ 522: "named-chunk" }[chunkId] || chunkId) + ".js";
 *
 * This patch unrolls the dynamic require for all the existing chunk files by switching on the computed path:
 *
 *  For multiple chunks:
 *     if (SELF_ID == chunkId) {
 *       installedChunks[chunkId] = 1;
 *     } else {
 *       switch ("./chunks/" + __webpack_require__.u(chunkId)) {
 *         case "./chunks/ID1.js": installChunk(require("./chunks/ID1.js")); break;
 *         case "./chunks/NAME.js": installChunk(require("./chunks/NAME.js")); break;
 *         // ...
 *         default: throw new Error(`Unknown chunk ${chunkId}`);
 *       }
 *     }
 *
 * For a single chunk, the same switch is used for `CHUNK_ID == chunkId`.
 * The chunk does not always exist so the default case is a no-op.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import logger from "@opennextjs/aws/logger.js";

/**
 * Builds the switch that requires the chunk files.
 *
 * Note: `$CHUNK_FILE` is the dynamic file name expression (`__webpack_require__.u(chunkId)`).
 *
 * @param chunks Chunk file names, relative to the chunks folder (i.e. `123.js`, `named-chunk.js`).
 * @param defaultCase Statement for the default case.
 */
function buildChunksSwitch(chunks: string[], defaultCase: string): string {
	const cases = chunks.map((chunk) => {
		// `$NAME` placeholders are substituted in the fix string, escape `$` to keep chunk names intact
		const path = JSON.stringify(`./chunks/${chunk}`).replaceAll("$", "\\x24");
		return `          case ${path}: $INSTALL(require(${path})); break;`;
	});

	return `        switch ("./chunks/" + $CHUNK_FILE) {
${cases.join("\n")}
          default: ${defaultCase}
        }`;
}

// Inline the code when there are multiple chunks
export function buildMultipleChunksRule(chunks: string[]) {
	return `
rule:
  pattern: ($CHUNK_ID, $_PROMISES) => { $$$ }
  inside: {pattern: $_.$_.require = $$$_, stopBy: end}
  all:
    - has: {pattern: $INSTALL(require("./chunks/" + $CHUNK_FILE)), stopBy: end}
    - has: {pattern: $SELF_ID != $CHUNK_ID, stopBy: end}
    - has: {pattern: "$INSTALLED_CHUNK[$CHUNK_ID] = 1", stopBy: end}
fix: |
  ($CHUNK_ID, _) => {
    if (!$INSTALLED_CHUNK[$CHUNK_ID]) {
      if ($SELF_ID == $CHUNK_ID) {
        $INSTALLED_CHUNK[$CHUNK_ID] = 1;
      } else {
${buildChunksSwitch(chunks, "throw new Error(`Unknown chunk ${$CHUNK_ID}`);")}
      }
    }
  }`;
}

// Inline the code when there is a single chunk.
// For example when there is a single Pages API route.
// Note: The chunk does not always exist which explain the no-op default case.
export function buildSingleChunkRule(chunks: string[]) {
	return `
rule:
  pattern: ($CHUNK_ID, $_PROMISES) => { $$$ }
  inside: {pattern: $_.$_.require = $$$_, stopBy: end}
  all:
    - has: {pattern: $INSTALL(require("./chunks/" + $CHUNK_FILE)), stopBy: end}
    - has: {pattern: $ONLY_ID == $CHUNK_ID, stopBy: end}
    - has: {pattern: "$INSTALLED_CHUNK[$CHUNK_ID] = 1", stopBy: end}
fix: |
  ($CHUNK_ID, _) => {
    if (!$INSTALLED_CHUNK[$CHUNK_ID]) {
      if ($ONLY_ID == $CHUNK_ID) {
${buildChunksSwitch(chunks, "break;")}
      } else {
        $INSTALLED_CHUNK[$CHUNK_ID] = 1;
      }
    }
  }`;
}

/**
 * Lists the chunk files.
 *
 * Named chunks can be nested (i.e. `webpackChunkName: "dir/name"` is emitted as `chunks/dir/name.js`).
 *
 * @param chunksDir Path to the chunks folder.
 * @returns The `.js` files, relative to the chunks folder and using `/` as the separator.
 */
export function listChunks(chunksDir: string): string[] {
	if (!existsSync(chunksDir)) {
		return [];
	}

	const chunks: string[] = [];
	const walk = (relativeDir: string) => {
		for (const entry of readdirSync(join(chunksDir, relativeDir), { withFileTypes: true })) {
			const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(relativePath);
			} else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".js")) {
				chunks.push(relativePath);
			}
		}
	};
	walk("");

	return chunks.sort();
}

/**
 * Fixes the webpack-runtime.js and webpack-api-runtime.js files by inlining
 * the webpack dynamic requires.
 */
export async function patchWebpackRuntime(dotNextServerDir: string) {
	const runtimes = ["webpack-runtime.js", "webpack-api-runtime.js"]
		.map((runtime) => join(dotNextServerDir, runtime))
		.filter((runtime) => existsSync(runtime));

	// Turbopack builds have no webpack runtime, skip listing the chunks
	if (runtimes.length === 0) {
		return;
	}

	const chunks = listChunks(join(dotNextServerDir, "chunks"));

	for (const runtime of runtimes) {
		patchFile(runtime, chunks);
	}
}

/**
 * Whether the code still contains the dynamic chunk require of the webpack runtime.
 *
 * @param code The webpack runtime code.
 * @returns `true` when `require("./chunks/" + ...)` is present.
 */
export function hasDynamicChunkRequire(code: string): boolean {
	return /require\("\.\/chunks\/"\s*\+/.test(code);
}

/**
 * Inline the chunks in a webpack runtime file.
 *
 * @param filename Path to the webpack runtime.
 * @param chunks List of chunk files in the chunks folder.
 */
function patchFile(filename: string, chunks: string[]) {
	let code = readFileSync(filename, "utf-8");
	code = patchCode(code, buildMultipleChunksRule(chunks));
	code = patchCode(code, buildSingleChunkRule(chunks));

	// A silent non-match would only surface at runtime when the worker fails to load a chunk
	if (hasDynamicChunkRequire(code)) {
		logger.error(
			`Failed to inline the dynamic chunk requires in ${filename}: the webpack runtime has an unexpected shape and loading chunks will fail at runtime.`
		);
	}

	writeFileSync(filename, code);
}
