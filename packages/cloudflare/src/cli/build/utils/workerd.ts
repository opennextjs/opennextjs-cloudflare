import { existsSync } from "node:fs";
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
// We only care about these fields
interface PackageJson {
	name: string;
	// Note: `exports` can be a string, i.e. `"exports": "./index.js"`
	exports?: string | { [key: string]: unknown };
	imports?: { [key: string]: unknown };
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
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
 * The `workerd` build of a package can depend on packages that its Node.js build does not use. Next.js
 * never traces those, so they are copied along, see `copyUntracedDependencies`.
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

	const ctx: CopyContext = { options, nodePackages, copiedDependencies: new Set() };

	for (const [src, dst] of nodePackages.entries()) {
		if (!packageRootRegex.test(src)) {
			continue;
		}
		try {
			const pkgJson = await readPackageJson(src);
			const { transformed, hasBuildCondition } = transformPackageJson(pkgJson);
			if (hasBuildCondition) {
				logger.debug(
					`Copying package using a workerd condition: ${path.relative(options.appPath, src)} -> ${path.relative(options.appPath, dst)}`
				);
				await copyPackage(src, dst, transformed);
				await copyUntracedDependencies(pkgJson, src, dst, ctx);
			}
		} catch (e) {
			logger.error(`Failed to copy ${src}:`, e instanceof Error ? e.message : e);
		}
	}
}

interface CopyContext {
	options: Pick<BuildOptions, "appPath">;
	/** The traced packages (installed directory to output directory) */
	nodePackages: Map<string, string>;
	/** The installed directories of the untraced dependencies that have been copied */
	copiedDependencies: Set<string>;
}

async function readPackageJson(dir: string): Promise<PackageJson> {
	return JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
}

/**
 * Copies a whole package and overwrites its `package.json` with the transformed one.
 */
async function copyPackage(src: string, dst: string, transformed: PackageJson) {
	await fs.cp(src, dst, { recursive: true, force: true });
	await fs.writeFile(path.join(dst, "package.json"), JSON.stringify(transformed), "utf8");
}

/**
 * Copies the dependencies of a `workerd` build that Next.js did not trace.
 *
 * The Node.js build and the `workerd` build of a package can import different dependencies. Next.js
 * only traces the former, so a dependency used only by the `workerd` build is missing from the output
 * and the server bundle would fail to resolve it.
 *
 * The dependencies are resolved from the installed package by walking up the `node_modules` folders
 * as Node.js does, which supports both the hoisted and the pnpm layouts. An untraced dependency is
 * copied to the location mirroring its installed location in the output, together with the symlink
 * pnpm uses to expose it to the package. Its own untraced dependencies are copied the same way.
 *
 * The dependencies that Next.js traced are left as they are.
 *
 * @param pkgJson `package.json` of the package
 * @param src Installed directory of the package
 * @param dst Output directory of the package
 * @param ctx Copy context
 */
async function copyUntracedDependencies(pkgJson: PackageJson, src: string, dst: string, ctx: CopyContext) {
	const { srcRoot, dstRoot } = getRoots(src, dst);
	// The installed tree might be reached through a symlink (i.e. `/var` -> `/private/var` on macOS)
	const srcRootReal = await fs.realpath(srcRoot);
	const names = Object.keys({ ...pkgJson.dependencies, ...pkgJson.optionalDependencies });

	for (const name of names) {
		const linkPath = findDependency(name, src);
		if (!linkPath) {
			// i.e. an optional dependency that is not installed
			continue;
		}
		const realPath = await fs.realpath(linkPath);
		if (ctx.nodePackages.has(realPath) || ctx.copiedDependencies.has(realPath)) {
			continue;
		}
		if (!isInside(realPath, srcRootReal) || !isInside(linkPath, srcRoot)) {
			logger.debug(`Not copying ${name}, it is installed outside of ${srcRoot}`);
			continue;
		}
		ctx.copiedDependencies.add(realPath);

		const depDst = path.join(dstRoot, path.relative(srcRootReal, realPath));
		if (existsSync(depDst)) {
			continue;
		}
		logger.debug(
			`Copying dependency of a workerd build: ${path.relative(ctx.options.appPath, realPath)} -> ${path.relative(ctx.options.appPath, depDst)}`
		);
		const depJson = await readPackageJson(realPath);
		await copyPackage(realPath, depDst, transformPackageJson(depJson).transformed);

		if ((await fs.lstat(linkPath)).isSymbolicLink()) {
			// pnpm exposes the dependency to the package through a symlink, recreate it in the output
			const linkDst = path.join(dstRoot, path.relative(srcRoot, linkPath));
			await fs.mkdir(path.dirname(linkDst), { recursive: true });
			await fs.symlink(await fs.readlink(linkPath), linkDst).catch((e: NodeJS.ErrnoException) => {
				if (e.code !== "EEXIST") {
					throw e;
				}
			});
		}

		await copyUntracedDependencies(depJson, realPath, depDst, ctx);
	}
}

/**
 * Finds the directory of a dependency as Node.js would resolve it from `fromDir`.
 *
 * @returns The directory of the dependency (a symlink with pnpm) or `undefined` when not found
 */
function findDependency(name: string, fromDir: string): string | undefined {
	let dir = fromDir;
	while (true) {
		if (path.basename(dir) !== "node_modules") {
			const candidate = path.join(dir, "node_modules", name);
			if (existsSync(path.join(candidate, "package.json"))) {
				return candidate;
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

/**
 * Splits the installed and the output directories of a package into the roots of the trees and the
 * common path of the package inside `node_modules`, i.e. `/app/node_modules/pg` and
 * `/app/.open-next/server-functions/default/node_modules/pg` have the roots `/app` and
 * `/app/.open-next/server-functions/default`.
 */
function getRoots(src: string, dst: string): { srcRoot: string; dstRoot: string } {
	const srcSegments = src.split(path.sep);
	const dstSegments = dst.split(path.sep);
	let common = 0;
	while (
		common < srcSegments.length &&
		common < dstSegments.length &&
		srcSegments[srcSegments.length - 1 - common] === dstSegments[dstSegments.length - 1 - common]
	) {
		common++;
	}
	return {
		srcRoot: srcSegments.slice(0, srcSegments.length - common).join(path.sep),
		dstRoot: dstSegments.slice(0, dstSegments.length - common).join(path.sep),
	};
}

function isInside(file: string, dir: string): boolean {
	const relative = path.relative(dir, file);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
