import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";
import { glob } from "glob";

import type { OpenNextConfig } from "../../../api";
import type { FolderNode } from "../../templates/skew-protection";

export async function compileSkewProtection(options: BuildOptions, config: OpenNextConfig) {
	const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
	const templatesDir = path.join(currentDir, "../../templates");
	const initPath = path.join(templatesDir, "skew-protection.js");

	const skewProtectionEnabled = config.cloudflare?.skewProtectionEnabled ?? false;

	// Create a tree of assets located inside the base path
	const assetPath = path.join(options.outputDir, "assets", globalThis.__NEXT_BASE_PATH__ ?? "");
	const files = skewProtectionEnabled
		? await glob(`**/*`, {
				windowsPathsNoEscape: true,
				posix: true,
				nodir: true,
				absolute: false,
				cwd: assetPath,
			})
		: [];
	// All files located inside `_next/static` are static assets, no need to list them
	const assetTree = filesToTree(files.filter((path) => !path.startsWith("_next/static/")));

	await build({
		entryPoints: [initPath],
		outdir: path.join(options.outputDir, "cloudflare"),
		bundle: false,
		minify: false,
		format: "esm",
		target: "esnext",
		platform: "node",
		define: {
			__SKEW_PROTECTION_ENABLED__: JSON.stringify(skewProtectionEnabled),
			__CF_ASSETS_TREE__: JSON.stringify(assetTree),
		},
	});
}

/**
 * Converts a list a file to tree of `FolderNode`
 *
 * @param paths The list of path
 * @returns The root node of the tree
 */
export function filesToTree(paths: string[]): FolderNode {
	const root: FolderNode = {
		f: [],
		d: {},
	};

	for (const filePath of paths) {
		// Split the path into components, filtering out empty strings from potential leading/trailing slashes
		const parts = filePath.split("/").filter(Boolean);

		let currentNode: FolderNode = root;

		// Traverse through folder parts, creating new nodes as needed
		for (let i = 0; i < parts.length - 1; i++) {
			const folderName = parts[i] as string;
			if (!currentNode.d[folderName]) {
				currentNode.d[folderName] = { f: [], d: {} };
			}
			currentNode = currentNode.d[folderName];
		}
		// Add the file to the current node's files array
		currentNode.f.push(parts[parts.length - 1] as string);
	}
	return root;
}
