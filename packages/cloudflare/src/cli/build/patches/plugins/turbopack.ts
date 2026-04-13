import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

const inlineChunksRule = `
rule:
  kind: call_expression
  pattern: require(resolved)
fix:
  requireChunk(chunkPath)
`;

export const patchTurbopackRuntime: CodePatcher = {
	name: "inline-turbopack-chunks",
	patches: [
		{
			versions: ">=15.0.0",
			pathFilter: getCrossPlatformPathRegex(String.raw`\[turbopack\]_runtime\.js$`, {
				escape: false,
			}),
			contentFilter: /loadRuntimeChunkPath/,
			patchCode: async ({ code, tracedFiles }) => {
				let patched = patchCode(code, inlineExternalImportRule);
				patched = patchCode(patched, inlineChunksRule);

				return `${patched}\n${inlineChunksFn(tracedFiles)}`;
			},
		},
		// Turbopack externalizes some packages with content-hashed module IDs,
		// e.g. `shiki-43d062b67f27bbdc/core`. These appear as `a.y("shiki-<hash>/core")`
		// calls in Turbopack chunk files. In workerd, `await import(hashedId)` fails
		// because no module is registered under the hashed name.
		//
		// The actual package IS bundled in node_modules. We patch the chunk files
		// before wrangler bundles them, replacing the hashed `a.y(...)` calls with static
		// `require("real-pkg/sub")` calls that wrangler can resolve at bundle time.
		{
			versions: ">=15.0.0",
			pathFilter: getCrossPlatformPathRegex(String.raw`.next[/\\]server[/\\]chunks[/\\].+\.js$`, {
				escape: false,
			}),
			contentFilter: /a\.y\("/,
			patchCode: async ({ code }) => {
				return patchHashedExternalImports(code);
			},
		},
	],
};

/**
 * Regex matching Turbopack's hashed external module IDs.
 *
 * Turbopack appends a 16+ hex-char content hash to the package name:
 *   `shiki-43d062b67f27bbdc`        → `shiki`
 *   `shiki-43d062b67f27bbdc/core`   → `shiki/core`
 *   `@shikijs/core-43d062b67f27bbdc/dist/index.js` → `@shikijs/core/dist/index.js`
 */
const HASHED_ID_RE = /^((?:@[^/]+\/)?[^/]+?)-[0-9a-f]{16,}(\/[^]*)?$/;

function dehashedModuleId(id: string): string | null {
	const match = HASHED_ID_RE.exec(id);
	if (!match) return null;
	return (match[1] + (match[2] ?? "")) || id;
}

/**
 * Replace `a.y("pkg-<hash>/sub")` calls with `Promise.resolve().then(() => require("pkg/sub"))`.
 *
 * The Promise wrapper preserves the async contract of `a.y` (externalImport).
 * The static `require("pkg/sub")` is resolved by wrangler at bundle time, so the
 * actual ESM package is inlined — the same mechanism as other require() calls in chunks.
 */
export function patchHashedExternalImports(code: string): string {
	return code.replace(/a\.y\("([^"]+)"\)/g, (match, id) => {
		const real = dehashedModuleId(id);
		if (real === null) return match;
		return `Promise.resolve().then(() => require("${real}"))`;
	});
}

function getInlinableChunks(tracedFiles: string[]): string[] {
	const chunks = new Set<string>();
	for (const file of tracedFiles) {
		if (file === "[turbopack]_runtime.js") {
			continue;
		}
		if (file.includes(".next/server/chunks/")) {
			chunks.add(file);
		}
	}
	return Array.from(chunks);
}

function inlineChunksFn(tracedFiles: string[]) {
	// From the outputs, we extract every chunks
	const chunks = getInlinableChunks(tracedFiles);
	return `
  function requireChunk(chunkPath) {
    switch(chunkPath) {
${chunks
	.map(
		(chunk) =>
			`      case "${
				// we only want the path after /path/to/.next/
				chunk.replace(/.*\/\.next\//, "")
			}": return require("${chunk}");`
	)
	.join("\n")}
      default:
        throw new Error(\`Not found \${chunkPath}\`);
    }
  }
`;
}

// Turbopack imports `og` via `externalImport`.
// We patch it to:
// - add the explicit path so that the file is inlined by wrangler
// - use the edge version of the module instead of the node version.
//
// Modules that are not inlined (no added to the switch), would generate an error similar to:
// Failed to load external module path/to/module: Error: No such module "path/to/module"
const inlineExternalImportRule = `
rule:
  pattern: "$RAW = await import($ID)"
  inside:
    regex: "externalImport"
    kind: function_declaration
    stopBy: end
fix: |-
  switch ($ID) {
    case "next/dist/compiled/@vercel/og/index.node.js":
      $RAW = await import("next/dist/compiled/@vercel/og/index.edge.js");
      break;
    default:
      $RAW = await import($ID);
  }
`;
