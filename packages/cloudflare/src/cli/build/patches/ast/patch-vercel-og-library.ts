import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getPackagePath } from "@opennextjs/aws/build/helper.js";
import { parseFile } from "@opennextjs/aws/build/patch/astCodePatcher.js";

import { patchVercelOgFallbackFont, patchVercelOgImport } from "./vercel-og.js";

type TraceInfo = { version: number; files: string[] };

/**
 * Patches a bundle's usage of @vercel/og for Cloudflare Workers.
 *
 * The server and middleware call this separately before esbuild, with their own traces and
 * output directories. Traced Node entries identify the edge library to copy and patch.
 * An unreadable trace keeps OG enabled, but errors preparing a traced library still throw.
 *
 * @param buildOpts Build options.
 * @param bundle The destination bundle root and the Next.js traces used by that bundle.
 * @returns Whether OG is traced by the bundle, or its usage cannot be determined.
 * @throws When a required library or compiled entry file cannot be read, copied, or patched.
 */
export function patchVercelOgLibrary(
	buildOpts: BuildOptions,
	bundle: { outputDir: string; traceFiles: string[] }
): boolean {
	const { appBuildOutputPath } = buildOpts;
	const packagePath = path.join(bundle.outputDir, getPackagePath(buildOpts));

	let useOg = false;

	for (const traceInfoPath of bundle.traceFiles) {
		// Look for the Node version of the traced @vercel/og files
		let tracedNodePath: string | undefined;
		try {
			const traceInfo: TraceInfo = JSON.parse(readFileSync(traceInfoPath, { encoding: "utf8" }));
			tracedNodePath = traceInfo.files.find((p) => p.endsWith("@vercel/og/index.node.js"));
		} catch {
			// Keep OG when the trace is unavailable rather than aliasing a potentially used library.
			useOg = true;
			continue;
		}
		if (!tracedNodePath) continue;

		// If we are here, it means the application is using the @vercel/og library
		// and there is an `index.edge.js` colocated file that we need to copy and patch.
		useOg = true;

		const outputDir = getOutputDir({ outputDir: bundle.outputDir, packagePath });
		const outputEdgePath = path.join(outputDir, "index.edge.js");

		// Ensure the edge version is available in the OpenNext node_modules.
		if (!existsSync(outputEdgePath)) {
			const tracedEdgePath = path.join(
				path.dirname(traceInfoPath),
				tracedNodePath.replace("index.node.js", "index.edge.js")
			);

			copyFileSync(tracedEdgePath, outputEdgePath);
		}

		// Next 16.2+ needs yoga.wasm in addition to the font and resvg.wasm traced for the Node entry.
		// Ensure it is copied even if the edge entry was already present in the output.
		const tracedWasmPath = path.join(
			path.dirname(traceInfoPath),
			tracedNodePath.replace("index.node.js", "yoga.wasm")
		);
		if (existsSync(tracedWasmPath)) {
			copyFileSync(tracedWasmPath, path.join(outputDir, "yoga.wasm"));
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
			const routeFilePath = path.join(
				packagePath,
				path.relative(appBuildOutputPath, traceInfoPath).replace(/\.nft\.json$/, "")
			);

			const ast = parseFile(routeFilePath);
			const { edits } = patchVercelOgImport(ast);
			writeFileSync(routeFilePath, ast.commitEdits(edits));
		}
	}

	return useOg;
}

/**
 * Locates the bundle's copy of the OG package, including monorepo layouts.
 *
 * @param opts The bundle root and its application package directory.
 * @returns The application-local OG directory, or the bundle-root OG directory.
 */
function getOutputDir(opts: { outputDir: string; packagePath: string }): string {
	const vercelOgNodeModulePath = "node_modules/next/dist/compiled/@vercel/og";

	const packageOutputPath = path.join(opts.packagePath, vercelOgNodeModulePath);
	if (existsSync(packageOutputPath)) {
		return packageOutputPath;
	}

	return path.join(opts.outputDir, vercelOgNodeModulePath);
}
