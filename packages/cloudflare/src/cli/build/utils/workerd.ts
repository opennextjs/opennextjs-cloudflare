import fs from "node:fs/promises";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

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
	const hasTopLevelBuildCondition = condition in conditionMap && conditionMap[condition] != null;
	let hasBuildCondition = hasTopLevelBuildCondition;
	for (const [key, value] of Object.entries(conditionMap)) {
		if (typeof value === "object" && value != null) {
			const { transformedExports, hasBuildCondition: innerBuildCondition } = transformBuildCondition(
				value as { [key: string]: unknown },
				condition
			);

			// If a build condition is present at this level but a sibling
			// subtree doesn't contain the build condition, we can drop it entirely.
			if (hasTopLevelBuildCondition && key !== condition && !innerBuildCondition) {
				continue;
			}

			transformed[key] = transformedExports;
			hasBuildCondition ||= innerBuildCondition;
		} else if (!hasTopLevelBuildCondition || key === condition) {
			// If there is no build condition at this level or this is a non-object build condition,
			// we need to keep the child condition as is.
			transformed[key] = value;
		}
	}
	return { transformedExports: transformed, hasBuildCondition };
}
// We only care about these 2 fields
interface PackageJson {
	name: string;
	// Note: `exports` can be a string, i.e. `"exports": "./index.js"`
	exports?: string | { [key: string]: unknown };
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
	if (json.exports && typeof json.exports === "object") {
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

/**
 * Copies the `workerd` build of the traced packages into the output directory.
 *
 * Next.js does not bundle every package: the packages it leaves external are traced with
 * `@vercel/nft`, which resolves imports with the Node.js conditions. The files only reachable
 * through a `workerd` export or import condition are therefore missing from the traced copy.
 *
 * The traced packages are the ones Next.js does not bundle: the packages listed in the user's
 * `serverExternalPackages`, the ones in the Next.js built-in list (e.g. `pg`, `@prisma/client`),
 * their transitive dependencies (e.g. `pg-cloudflare`, pulled in by `pg`), and the dependencies of
 * the Next.js server itself. The user's `serverExternalPackages` is not enough to find the packages
 * with a `workerd` build, so all of them are checked. The ones declaring a `workerd` condition are
 * copied in full with a `package.json` that only keeps that condition, so that the server bundle
 * resolves their `workerd` build.
 *
 * Only the root folder of packages installed in a `node_modules` folder is considered: the trace
 * also lists the `package.json` of the app itself (copying the app into its own output would not end
 * well), nested `package.json` files used as module type markers, and workspace packages living
 * outside of `node_modules` (not supported).
 *
 * @param options Build options, `appPath` is only used to log relative paths
 * @param nodePackages Map of the traced package directories to their copy in the output directory
 */
export async function copyWorkerdPackages(
	options: Pick<BuildOptions, "appPath">,
	nodePackages: Map<string, string>
) {
	// The root folder of a (possibly scoped) package inside a `node_modules` folder, on posix and Windows.
	const packageRootRegex = /[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+$/;

	for (const [src, dst] of nodePackages.entries()) {
		if (!packageRootRegex.test(src)) {
			continue;
		}
		try {
			const pkgJson = JSON.parse(await fs.readFile(path.join(src, "package.json"), "utf8"));
			const { transformed, hasBuildCondition } = transformPackageJson(pkgJson);
			if (hasBuildCondition) {
				logger.debug(
					`Copying package using a workerd condition: ${path.relative(options.appPath, src)} -> ${path.relative(options.appPath, dst)}`
				);
				await fs.cp(src, dst, { recursive: true, force: true });
				// Overwrite with  the transformed package.json
				await fs.writeFile(path.join(dst, "package.json"), JSON.stringify(transformed), "utf8");
			}
		} catch (e) {
			logger.error(`Failed to copy ${src}:`, e instanceof Error ? e.message : e);
		}
	}
}
