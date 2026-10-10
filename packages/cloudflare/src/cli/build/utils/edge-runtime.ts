import path from "node:path";

import { loadMiddlewareManifest } from "@opennextjs/aws/adapters/config/util.js";
import type * as buildHelper from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

/**
 * Returns the routes (pages and route handlers) that use the edge runtime.
 *
 * The edge middleware is not part of the result as it is supported.
 *
 * @param options
 * @returns The sorted edge runtime routes, empty when there are none or the manifest is unavailable
 */
export function getEdgeRuntimeRoutes(options: buildHelper.BuildOptions): string[] {
	const buildOutputDotNextDir = path.join(options.appBuildOutputPath, ".next");

	try {
		const { functions } = loadMiddlewareManifest(buildOutputDotNextDir);
		return Object.entries(functions ?? {})
			.map(([key, fn]) => fn?.page ?? key)
			.sort();
	} catch (e) {
		// The manifest is missing or unreadable, there is nothing to report.
		logger.debug(`Could not read the middleware manifest to check for edge runtime routes: ${e}`);
		return [];
	}
}

/**
 * Filters out the edge runtime routes that are bundled in a separate edge function.
 *
 * @param edgeRoutes Routes from the middleware manifest (i.e. `/api/hello/route`, `/api/hello`, `/`)
 * @param foundRoutes Routes handled by the functions of the OpenNext config (i.e. `app/api/hello/route`, `pages/api/hello`, `pages/index`)
 * @returns The edge runtime routes that are not handled by a separate function
 */
export function getUnhandledEdgeRuntimeRoutes(edgeRoutes: string[], foundRoutes: Set<string>): string[] {
	return edgeRoutes.filter(
		(page) =>
			!foundRoutes.has(`app${page}`) &&
			!foundRoutes.has(`pages${page}`) &&
			!foundRoutes.has(`pages${page === "/" ? "" : page}/index`)
	);
}
