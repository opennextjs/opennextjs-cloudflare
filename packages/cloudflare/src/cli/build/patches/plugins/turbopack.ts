import fs from "node:fs";
import path from "node:path";

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

/**
 * Discover Turbopack external module mappings by reading symlinks in .next/node_modules/.
 *
 * Turbopack externalizes packages listed in serverExternalPackages and creates hashed
 * identifiers (e.g. "shiki-43d062b67f27bbdc") with symlinks in .next/node_modules/ pointing
 * to the real packages (e.g. ../../node_modules/shiki). At runtime, externalImport() does
 * `await import("shiki-43d062b67f27bbdc/wasm")` which fails on workerd because those hashed
 * names are not real modules. This function discovers the mappings so we can intercept them.
 */
function discoverExternalModuleMappings(filePath: string): Map<string, string> {
	// filePath is like: .../.next/server/chunks/ssr/[turbopack]_runtime.js
	// We need: .../.next/node_modules/
	const dotNextDir = filePath.replace(/\/server\/chunks\/.*$/, "");
	const nodeModulesDir = path.join(dotNextDir, "node_modules");

	const mappings = new Map<string, string>();

	if (!fs.existsSync(nodeModulesDir)) {
		return mappings;
	}

	for (const entry of fs.readdirSync(nodeModulesDir)) {
		const entryPath = path.join(nodeModulesDir, entry);
		try {
			const stat = fs.lstatSync(entryPath);
			if (stat.isSymbolicLink()) {
				const target = fs.readlinkSync(entryPath);
				// target is like "../../node_modules/shiki" — extract package name
				const match = target.match(/node_modules\/(.+)$/);
				if (match?.[1]) {
					mappings.set(entry, match[1]);
				}
			}
		} catch {
			// skip entries we can't read
		}
	}

	return mappings;
}

/**
 * Build a dynamic inlineExternalImportRule that includes cases for all discovered
 * Turbopack external module hashes, mapping them back to their real package names.
 *
 * We use a switch for exact matches (including bare + subpath cases) and a fallback
 * for the default case. Since switch/case can only match exact strings, we enumerate
 * known subpaths from the traced files to cover cases like "shiki-hash/wasm".
 */
function buildExternalImportRule(mappings: Map<string, string>, tracedFiles: string[]): string {
	const cases: string[] = [];

	// Always include the @vercel/og rewrite
	cases.push(`    case "next/dist/compiled/@vercel/og/index.node.js":
      $RAW = await import("next/dist/compiled/@vercel/og/index.edge.js");
      break;`);

	// Add case for each discovered external module mapping (bare import)
	for (const [hashedName, realName] of mappings) {
		cases.push(`    case "${hashedName}":
      $RAW = await import("${realName}");
      break;`);
	}

	// Discover subpath imports from the traced chunk files.
	// Chunks reference external modules like "shiki-hash/wasm" — scan for these patterns.
	const subpathCases = discoverExternalSubpaths(mappings, tracedFiles);
	for (const [hashedSubpath, realSubpath] of subpathCases) {
		cases.push(`    case "${hashedSubpath}":
      $RAW = await import("${realSubpath}");
      break;`);
	}

	return `
rule:
  pattern: "$RAW = await import($ID)"
  inside:
    regex: "externalImport"
    kind: function_declaration
    stopBy: end
fix: |-
  switch ($ID) {
${cases.join("\n")}
    default:
      $RAW = await import($ID);
  }
`;
}

/**
 * Scan traced chunk files for external module subpath imports.
 * E.g. find "shiki-43d062b67f27bbdc/wasm" in chunk code and map it to "shiki/wasm".
 *
 * Only scans files with "[externals]" in the name since those are the chunks that
 * contain externalImport calls.
 */
function discoverExternalSubpaths(mappings: Map<string, string>, tracedFiles: string[]): Map<string, string> {
	const subpaths = new Map<string, string>();

	const externalChunks = tracedFiles.filter((f) => f.includes("[externals]"));

	for (const [hashedName, realName] of mappings) {
		const pattern = new RegExp(`"(${hashedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^"]*)"`, "g");

		for (const filePath of externalChunks) {
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				for (const match of content.matchAll(pattern)) {
					const fullHashedPath = match[1];
					if (fullHashedPath) {
						const subpath = fullHashedPath.slice(hashedName.length);
						const realSubpath = realName + subpath;
						subpaths.set(fullHashedPath, realSubpath);
					}
				}
			} catch {
				// skip files we can't read
			}
		}
	}

	return subpaths;
}

export const patchTurbopackRuntime: CodePatcher = {
	name: "inline-turbopack-chunks",
	patches: [
		{
			versions: ">=15.0.0",
			pathFilter: getCrossPlatformPathRegex(String.raw`\[turbopack\]_runtime\.js$`, {
				escape: false,
			}),
			contentFilter: /loadRuntimeChunkPath/,
			patchCode: async ({ code, tracedFiles, filePath }) => {
				const mappings = discoverExternalModuleMappings(filePath);
				const externalImportRule = buildExternalImportRule(mappings, tracedFiles);
				let patched = patchCode(code, externalImportRule);
				patched = patchCode(patched, inlineChunksRule);

				return `${patched}\n${inlineChunksFn(tracedFiles)}`;
			},
		},
	],
};

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
