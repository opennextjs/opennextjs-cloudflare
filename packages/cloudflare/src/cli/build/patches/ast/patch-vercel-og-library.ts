import { copyFileSync, existsSync, globSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getPackagePath } from "@opennextjs/aws/build/helper.js";
import { parseFile } from "@opennextjs/aws/build/patch/astCodePatcher.js";

import { patchVercelOgFallbackFont, patchVercelOgImport } from "./vercel-og.js";

type TraceInfo = { version: number; files: string[] };

/**
 * Patches the usage of @vercel/og to be compatible with Cloudflare Workers.
 *
 * @param buildOpts Build options.
 * @returns Whether the @vercel/og library is used.
 */
export function patchVercelOgLibrary(buildOpts: BuildOptions): boolean {
	const { appBuildOutputPath, outputDir } = buildOpts;

	const functionsPath = path.join(outputDir, "server-functions/default");
	const packagePath = path.join(functionsPath, getPackagePath(buildOpts));

	let useOg = false;

	for (const traceInfoPath of globSync(".next/server/**/*.nft.json", { cwd: appBuildOutputPath })) {
		const fullTraceInfoPath = path.join(appBuildOutputPath, traceInfoPath);

		// Look for the Node version of the traced @vercel/og files
		const traceInfo: TraceInfo = JSON.parse(readFileSync(fullTraceInfoPath, { encoding: "utf8" }));
		const tracedNodePath = traceInfo.files.find((p) => p.endsWith("@vercel/og/index.node.js"));
		if (!tracedNodePath) continue;

		// If we are here, it means the application is using the @vercel/og library
		// and there is an `index.edge.js` colocated file that we need to copy and patch.
		useOg = true;

		const outputDir = getOutputDir({ functionsPath, packagePath });
		const outputEdgePath = path.join(outputDir, "index.edge.js");

		// Ensure the edge version is available in the OpenNext node_modules.
		if (!existsSync(outputEdgePath)) {
			const tracedEdgePath = path.join(
				path.dirname(fullTraceInfoPath),
				tracedNodePath.replace("index.node.js", "index.edge.js")
			);

			copyFileSync(tracedEdgePath, outputEdgePath);

			// On Next 16.2 and above, we also need to copy the yoga.wasm file used by the library.
			const tracedWasmPath = path.join(
				path.dirname(fullTraceInfoPath),
				tracedNodePath.replace("index.node.js", "yoga.wasm")
			);
			if (existsSync(tracedWasmPath)) {
				copyFileSync(tracedWasmPath, path.join(outputDir, "yoga.wasm"));
			}
		}

		// Change font fetches in the library to use imports.
		{
			const ast = parseFile(outputEdgePath);
			const { edits, matches } = patchVercelOgFallbackFont(ast);
			writeFileSync(outputEdgePath, ast.commitEdits(edits));

			if (matches.length > 0) {
				const fontFileName = matches[0]!.getMatch("PATH")!.text();
				renameSync(path.join(outputDir, fontFileName), path.join(outputDir, `${fontFileName}.bin`));
			}
		}

		// Change node imports for the library to edge imports.
		// This is only useful when turbopack is not used to bundle the function.
		{
			const routeFilePath = path.join(packagePath, traceInfoPath.replace(".nft.json", ""));

			const ast = parseFile(routeFilePath);
			const { edits } = patchVercelOgImport(ast);
			writeFileSync(routeFilePath, ast.commitEdits(edits));
		}
	}

	return useOg;
}

function getOutputDir(opts: { functionsPath: string; packagePath: string }) {
	const vercelOgNodeModulePath = "node_modules/next/dist/compiled/@vercel/og";

	const packageOutputPath = path.join(opts.packagePath, vercelOgNodeModulePath);
	if (existsSync(packageOutputPath)) {
		return packageOutputPath;
	}

	return path.join(opts.functionsPath, vercelOgNodeModulePath);
}
