import fs from "node:fs";
import path from "node:path";

import { loadFunctionsConfigManifest, loadMiddlewareManifest } from "@opennextjs/aws/adapters/config/util.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";

const middlewareFileNames = ["proxy", "middleware"];
const middlewareExtensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".mts", ".cjs", ".cts"];

const unsupportedModules = new Map([
	["child_process", "spawning child processes is not available in Workers"],
	["cluster", "Node cluster workers are not available in Workers"],
	["worker_threads", "Node worker threads are not available in Workers"],
	["fs", "persistent filesystem access is not available in Workers"],
	["fs/promises", "persistent filesystem access is not available in Workers"],
]);

export function getUnsupportedNodeMiddlewareModuleReason(specifier: string): string | undefined {
	return unsupportedModules.get(specifier.replace(/^node:/, ""));
}

export function isNativeNodeAddonSpecifier(specifier: string): boolean {
	return specifier.endsWith(".node") || specifier.includes(".node?");
}

/**
 * Returns whether the project is using a Node.js middleware.
 *
 * @param options
 * @returns Whether the project is using a Node.js middleware
 */
export function useNodeMiddleware(options: buildHelper.BuildOptions): boolean {
	const buildOutputDotNextDir = path.join(options.appBuildOutputPath, ".next");

	// Look for the edge middleware
	const middlewareManifest = loadMiddlewareManifest(buildOutputDotNextDir);
	const edgeMiddleware = middlewareManifest.middleware["/"];
	if (edgeMiddleware) {
		// The app uses an edge middleware
		return false;
	}

	// Look for the node middleware
	const functionsConfigManifest = loadFunctionsConfigManifest(buildOutputDotNextDir);
	return Boolean(functionsConfigManifest?.functions["/_middleware"]);
}

export function validateNodeMiddlewareForWorkers(options: buildHelper.BuildOptions): void {
	const sourceFiles = findNodeMiddlewareSourceFiles(options.appPath);
	const issues = sourceFiles.flatMap((sourceFile) =>
		validateNodeMiddlewareSource(fs.readFileSync(sourceFile, "utf-8"), sourceFile)
	);

	if (issues.length === 0) {
		return;
	}

	throw new Error(
		[
			"Node.js middleware/proxy uses runtime features that are not supported by @opennextjs/cloudflare's Workers-compatible Node middleware bundle:",
			...issues.map((issue) => `- ${path.relative(options.appPath, issue.sourcePath)}: ${issue.message}`),
		].join("\n")
	);
}

export type NodeMiddlewareValidationIssue = {
	sourcePath: string;
	message: string;
};

export function findNodeMiddlewareSourceFiles(appPath: string): string[] {
	const files: string[] = [];

	for (const dir of [appPath, path.join(appPath, "src")]) {
		for (const fileName of middlewareFileNames) {
			for (const extension of middlewareExtensions) {
				const filePath = path.join(dir, `${fileName}${extension}`);
				if (fs.existsSync(filePath)) {
					files.push(filePath);
				}
			}
		}
	}

	return files;
}

export function validateNodeMiddlewareSource(
	source: string,
	sourcePath = "proxy.ts"
): NodeMiddlewareValidationIssue[] {
	const issues: NodeMiddlewareValidationIssue[] = [];
	const moduleSpecifiers = getStaticModuleSpecifiers(source);

	for (const specifier of moduleSpecifiers) {
		const reason = getUnsupportedNodeMiddlewareModuleReason(specifier);
		if (reason) {
			issues.push({
				sourcePath,
				message: `imports unsupported module "${specifier}" (${reason})`,
			});
		}
		if (isNativeNodeAddonSpecifier(specifier)) {
			issues.push({
				sourcePath,
				message: `imports native addon "${specifier}" (native Node addons are not available in Workers)`,
			});
		}
	}

	if (/\brequire\s*\(\s*(?!["'])/.test(source)) {
		issues.push({
			sourcePath,
			message: "uses dynamic require(); only statically analyzable imports are supported",
		});
	}

	if (/\bimport\s*\(\s*(?!["'])/.test(source)) {
		issues.push({
			sourcePath,
			message: "uses dynamic import(); only statically analyzable imports are supported",
		});
	}

	if (/["'][^"']+\.node(?:\?[^"']*)?["']/.test(source)) {
		issues.push({
			sourcePath,
			message: "references a native .node addon (native Node addons are not available in Workers)",
		});
	}

	return issues;
}

function getStaticModuleSpecifiers(source: string): string[] {
	const patterns = [
		/\bimport\s+(?!type\b)[^'"]*?\s+from\s*["']([^"']+)["']/g,
		/\bexport\s+(?!type\b)[^'"]*?\s+from\s*["']([^"']+)["']/g,
		/\bimport\s*["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\.resolve\s*\(\s*["']([^"']+)["']\s*\)/g,
	];

	return patterns.flatMap((pattern) =>
		[...source.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []))
	);
}
