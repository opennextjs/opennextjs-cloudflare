import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

import { isNextJS16OrHigher } from "./next-version.js";

/**
 * Validate Next.js version compatibility and log information
 * @param options Build options containing Next.js version information
 */
export function validateNextJSCompatibility(options: BuildOptions): void {
	const version = options.nextVersion;
	const isNext16 = isNextJS16OrHigher(version);

	logger.info(`Detected Next.js version: ${version}`);

	if (isNext16) {
		logger.warn("Next.js 16+ detected: Looking for proxy.js/mjs/ts instead of middleware.js/mjs/ts");
	} else {
		logger.info("Next.js <16 detected: Using middleware.js/mjs/ts naming convention");
	}
}

/**
 * Log middleware detection results with detailed information
 * @param options Build options containing Next.js version information
 * @param buildDir Path to the build directory
 * @param fileName Detected middleware filename
 * @param exists Whether the middleware file exists
 */
export function logMiddlewareDetection(
	options: BuildOptions,
	buildDir: string,
	fileName: string,
	found: boolean,
): void {
	const version = options.nextVersion;
	const isNext16 = isNextJS16OrHigher(version);

	if (found) {
		logger.info(`Found ${fileName} (Next.js ${version})`);
	} else {
		logger.warn(`No ${isNext16 ? "proxy" : "middleware"} file found in build directory`);
		logger.warn(`Expected: ${fileName}`);
		logger.warn(`Build directory: ${buildDir}`);

		if (isNext16) {
			logger.warn("Note: Next.js 16+ uses proxy.js instead of middleware.js");
		}
	}
}