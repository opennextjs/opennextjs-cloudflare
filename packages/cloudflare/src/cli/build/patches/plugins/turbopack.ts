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

export const inlineChunksPatch: CodePatcher = {
	name: "inline-turbopack-chunks",
	patches: [
		{
			versions: ">=15.0.0",
			pathFilter: getCrossPlatformPathRegex(String.raw`\[turbopack\]_runtime\.js$`, {
				escape: false,
			}),
			contentFilter: /loadRuntimeChunkPath/,
			patchCode: async ({ code, tracedFiles }) => {
				const patched = patchCode(code, inlineChunksRule);

				return `${patched}\n${inlineChunksFn(tracedFiles)}`;
			},
		},
	],
};

function getInlinableChunks(tracedFiles: string[]) {
	const chunks = new Set<string>();
	for (const file of tracedFiles) {
		if (file.includes(".next/server/chunks/") && !file.includes("[turbopack]_runtime.js")) {
			chunks.add(file);
		}
	}
	return chunks;
}

function inlineChunksFn(tracedFiles: string[]) {
	// From the outputs, we extract every chunks
	const chunks = getInlinableChunks(tracedFiles);
	return `
  function requireChunk(chunkPath) {
    switch(chunkPath) {
${Array.from(chunks)
	.map(
		(chunk) =>
			`      case "${
				// we only want the path after /path/to/.next/
				chunk.replace(/.*\.next\//, "")
			}": return require("${chunk}");`
	)
	.join("\n")}
      default:
        throw new Error(\`Not found \${chunkPath}\`);
    }
  }
`;
}
