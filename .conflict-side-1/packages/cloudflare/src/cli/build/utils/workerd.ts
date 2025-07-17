import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

/**
 * This function transforms the exports (or imports) object from the package.json
 * to only include the build condition if found (e.g. "workerd") and remove everything else.
 * If no build condition is found, it keeps everything as is.
 * It also returns a boolean indicating if the build condition was found.
 * @param conditionMap The exports (or imports) object from the package.json
 * @param condition The build condition to look for
 * @returns An object with the transformed exports and a boolean indicating if the build condition was found
 */
export function transformBuildCondition(
	conditionMap: { [key: string]: unknown },
	condition: string
): {
	transformedExports: { [key: string]: unknown };
	hasBuildCondition: boolean;
} {
	const transformed: { [key: string]: unknown } = {};
	const hasTopLevelBuildCondition = Object.keys(conditionMap).some(
		(key) => key === condition && typeof conditionMap[key] === "string"
	);
	let hasBuildCondition = hasTopLevelBuildCondition;
	for (const [key, value] of Object.entries(conditionMap)) {
		if (typeof value === "object" && value != null) {
			const { transformedExports, hasBuildCondition: innerBuildCondition } = transformBuildCondition(
				value as { [key: string]: unknown },
				condition
			);
			transformed[key] = transformedExports;
			hasBuildCondition ||= innerBuildCondition;
		} else {
			// If it doesn't have the build condition, we need to keep everything as is
			// If it has the build condition, we need to keep only the build condition
			// and remove everything else
			if (!hasTopLevelBuildCondition) {
				transformed[key] = value;
			} else if (key === condition) {
				transformed[key] = value;
			}
		}
	}
	return { transformedExports: transformed, hasBuildCondition };
}
// We only care about these 2 fields
interface PackageJson {
	name: string;
	exports?: { [key: string]: unknown };
	imports?: { [key: string]: unknown };
}

/**
 *
 * @param json The package.json object
 * @returns An object with the transformed package.json and a boolean indicating if the build condition was found
 */
export function transformPackageJson(json: PackageJson) {
	const transformed: PackageJson = structuredClone(json);
	let hasBuildCondition = false;
	if (json.exports) {
		const exp = transformBuildCondition(json.exports, "workerd");
		transformed.exports = exp.transformedExports;
		hasBuildCondition ||= exp.hasBuildCondition;
	}
	if (json.imports) {
		const imp = transformBuildCondition(json.imports, "workerd");
		transformed.imports = imp.transformedExports;
		hasBuildCondition ||= imp.hasBuildCondition;
	}
	return { transformed, hasBuildCondition };
}

export async function copyWorkerdPackages(options: BuildOptions, nodePackages: Map<string, string>) {
	const isNodeModuleRegex = getCrossPlatformPathRegex(`.*/node_modules/(?<pkg>.*)`, { escape: false });

	// Copy full external packages when they use "workerd" build condition
	const nextConfig = loadConfig(path.join(options.appBuildOutputPath, ".next"));
	const externalPackages =
		// @ts-expect-error In Next 14 its under experimental.serverComponentsExternalPackages
		nextConfig.serverExternalPackages ?? nextConfig.experimental.serverComponentsExternalPackages ?? [];
	for (const [src, dst] of nodePackages.entries()) {
		try {
			const pkgJson = JSON.parse(await fs.readFile(path.join(src, "package.json"), "utf8"));
			const { transformed, hasBuildCondition } = transformPackageJson(pkgJson);
			const match = src.match(isNodeModuleRegex);
			if (match?.groups?.pkg && externalPackages.includes(match.groups.pkg) && hasBuildCondition) {
				logger.debug(
					`Copying package using a workerd condition: ${path.relative(options.appPath, src)} -> ${path.relative(options.appPath, dst)}`
				);
				await fs.cp(src, dst, { recursive: true, force: true });
				// Overwrite with  the transformed package.json
				await fs.writeFile(path.join(dst, "package.json"), JSON.stringify(transformed), "utf8");
			}
		} catch {
			logger.error(`Failed to copy ${src}`);
		}
	}
}
