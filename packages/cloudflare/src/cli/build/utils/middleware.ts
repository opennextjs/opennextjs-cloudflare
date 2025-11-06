import path from "node:path";

import { loadFunctionsConfigManifest, loadMiddlewareManifest } from "@opennextjs/aws/adapters/config/util.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";

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
