import fs from "node:fs";
import path from "node:path";

import * as buildHelper from "@opennextjs/aws/build/helper.js";

/**
 * Extract Next.js version from package.json
 * @param projectRoot Path to the project root directory
 * @returns Next.js version string or null if not found
 */
export function getNextJSVersion(projectRoot: string): string | null {
	try {
		const packageJsonPath = path.join(projectRoot, "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

		return packageJson.dependencies?.next ?? packageJson.devDependencies?.next ?? null;
	} catch {
		return null;
	}
}

/**
 * Check if a version is Next.js 16 or higher
 * @param version The Next.js version string to check
 * @returns true if version is 16 or higher, false otherwise
 */
export function isNextJS16OrHigher(version: string): boolean {
	if (!version) {
		return false;
	}

	return buildHelper.compareSemver(version, ">=", "16.0.0");
}

/**
 * Check if a version meets or exceeds a target version
 * @param version The Next.js version string to check
 * @param targetVersion The version to compare against
 * @returns true if version is equal or higher than target, false otherwise
 */
export function isNextJSVersionOrHigher(version: string, targetVersion: string): boolean {
	if (!version) {
		return false;
	}

	return buildHelper.compareSemver(version, ">=", targetVersion);
}

/**
 * Get the major version number from Next.js version string
 * @param projectRoot Path to the project root directory
 * @returns Major version number or null if not found
 */
export function getNextMajorVersion(projectRoot: string): number | null {
	const version = getNextJSVersion(projectRoot);
	if (!version) {
		return null;
	}

	const versionMatch = version.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!versionMatch) {
		return null;
	}

	return parseInt(versionMatch[1], 10);
}