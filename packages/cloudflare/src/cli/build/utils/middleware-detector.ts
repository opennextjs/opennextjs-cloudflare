import fs from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

import { isNextJS16OrHigher } from "./next-version.js";

/**
 * Get the appropriate middleware filename based on Next.js version
 * @param options Build options containing Next.js version information
 * @param buildDir Path to the build directory containing middleware files
 * @returns The middleware filename (with extension)
 */
export function getMiddlewareFileName(options: BuildOptions, buildDir: string): string {
	const isNext16 = isNextJS16OrHigher(options.nextVersion);

	if (isNext16) {
		const extensions = [".js", ".mjs", ".ts"];
		for (const ext of extensions) {
			const proxyPath = path.join(buildDir, `proxy${ext}`);
			if (fs.existsSync(proxyPath)) {
				return `proxy${ext}`;
			}
		}
	}

	const extensions = [".js", ".mjs", ".ts"];
	for (const ext of extensions) {
		const middlewarePath = path.join(buildDir, `middleware${ext}`);
		if (fs.existsSync(middlewarePath)) {
			return `middleware${ext}`;
		}
	}

	return isNext16 ? "proxy.js" : "middleware.js";
}

/**
 * Get the full path to the middleware file based on Next.js version
 * @param options Build options containing Next.js version information
 * @param buildDir Path to the build directory containing middleware files
 * @returns Full path to the middleware file
 */
export function getMiddlewarePath(options: BuildOptions, buildDir: string): string {
	const fileName = getMiddlewareFileName(options, buildDir);
	return path.join(buildDir, fileName);
}

/**
 * Get the middleware handler name without extension for import statements
 * @param options Build options containing Next.js version information
 * @param buildDir Path to the build directory containing middleware files
 * @returns Handler name without extension for import statements
 */
export function getMiddlewareHandlerName(options: BuildOptions, buildDir: string): string {
	const fileName = getMiddlewareFileName(options, buildDir);
	return fileName.replace(/\.[^/.]+$/, "");
}

/**
 * Check if the middleware file exists
 * @param options Build options containing Next.js version information
 * @param buildDir Path to the build directory containing middleware files
 * @returns true if the middleware file exists, false otherwise
 */
export function middlewareFileExists(options: BuildOptions, buildDir: string): boolean {
	const middlewarePath = getMiddlewarePath(options, buildDir);
	return fs.existsSync(middlewarePath);
}