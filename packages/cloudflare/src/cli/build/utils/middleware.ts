import path from "node:path";

import { loadFunctionsConfigManifest, loadMiddlewareManifest } from "@opennextjs/aws/adapters/config/util.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";

/**
 * Returns the destination path for the bundled Node.js middleware inside the
 * server-functions output — where esbuild expects to find it after the copy step.
 */
export function getBundledMiddlewarePath(options: buildHelper.BuildOptions): string {
	return path.join(
		options.outputDir,
		"server-functions/default",
		buildHelper.getPackagePath(options),
		".next/server/middleware.js"
	);
}

/**
 * Returns whether the project is using a Node.js middleware (proxy.ts in Next.js 16+).
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

/**
 * Returns the path to the compiled Node.js middleware (`middleware.js`) inside
 * the Next.js standalone output directory.
 *
 * Next.js compiles `proxy.ts` (Node.js middleware) to
 * `.next/server/middleware.js` and copies it into the standalone bundle.
 */
export function getStandaloneMiddlewarePath(options: buildHelper.BuildOptions): string {
	return path.join(
		options.appBuildOutputPath,
		".next",
		"standalone",
		buildHelper.getPackagePath(options),
		".next",
		"server",
		"middleware.js"
	);
}
