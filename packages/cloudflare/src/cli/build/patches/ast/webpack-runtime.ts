/**
 * Inline the dynamic chunk requires of the webpack runtime.
 *
 * The webpack runtime loads chunks with a dynamic require that ESBuild can not bundle:
 *
 *     installChunk(require("./chunks/" + __webpack_require__.u(chunkId)));
 *
 * `__webpack_require__.u` returns `<id>.js`, or `<name>.js` for a named chunk (`webpackChunkName`).
 * The require is replaced with a switch over the existing chunk files:
 *
 *     installChunk(((path) => {
 *       switch (path) {
 *         case "./chunks/123.js": return require("./chunks/123.js");
 *         case "./chunks/named.js": return require("./chunks/named.js");
 *         default: throw new Error(`Unknown chunk ${path}`);
 *       }
 *     })("./chunks/" + __webpack_require__.u(chunkId)));
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import logger from "@opennextjs/aws/logger.js";

/**
 * Builds the rule inlining the dynamic chunk require.
 *
 * @param chunks Chunk files, relative to the chunks folder (i.e. `123.js`, `named-chunk.js`).
 * @returns The ast-grep rule.
 */
export function buildChunkRequireRule(chunks: string[]): string {
	const cases = chunks.map((chunk) => {
		// Escape `$` so that ast-grep does not treat it as a metavariable
		const path = JSON.stringify(`./chunks/${chunk}`).replaceAll("$", "\\x24");
		return `      case ${path}: return require(${path});`;
	});

	return `
rule:
  pattern: require("./chunks/" + $CHUNK_FILE)
  inside: {pattern: $_.$_.require = $$$_, stopBy: end}
fix: |
  ((path) => {
    switch (path) {
${cases.join("\n")}
      default: throw new Error(\`Unknown chunk \${path}\`);
    }
  })("./chunks/" + $CHUNK_FILE)`;
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

	return readdirSync(chunksDir, { encoding: "utf-8", recursive: true })
		.filter((file) => file.endsWith(".js"))
		.map((file) => file.replaceAll(sep, "/"))
		.sort();
}

/**
 * Fixes the webpack-runtime.js and webpack-api-runtime.js files by inlining
 * the webpack dynamic requires.
 *
 * @param dotNextServerDir Path to the `.next/server` folder.
 */
export async function patchWebpackRuntime(dotNextServerDir: string) {
	const runtimes = ["webpack-runtime.js", "webpack-api-runtime.js"]
		.map((runtime) => join(dotNextServerDir, runtime))
		.filter((runtime) => existsSync(runtime));

	// Turbopack builds have no webpack runtime
	if (runtimes.length === 0) {
		return;
	}

	const chunks = listChunks(join(dotNextServerDir, "chunks"));

	for (const runtime of runtimes) {
		patchFile(runtime, chunks);
	}
}

/**
 * Inline the chunks in a webpack runtime file.
 *
 * @param filename Path to the webpack runtime.
 * @param chunks List of chunk files in the chunks folder.
 */
function patchFile(filename: string, chunks: string[]) {
	const code = patchCode(readFileSync(filename, "utf-8"), buildChunkRequireRule(chunks));

	// The worker would fail to load chunks at runtime
	if (/require\("\.\/chunks\/"\s*\+/.test(code)) {
		logger.error(`Failed to inline the dynamic chunk requires in ${filename}`);
	}

	writeFileSync(filename, code);
}
