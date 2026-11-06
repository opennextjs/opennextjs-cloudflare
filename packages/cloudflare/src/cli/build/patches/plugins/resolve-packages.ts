/**
 * ESBuild plugin resolving packages from the installed `node_modules`, preferring the traced copies.
 *
 * The server functions output (`.open-next/server-functions/default`) only contains the files traced
 * by Next.js, with the Node.js conditions. The server is bundled with the `workerd` condition, so
 * the files only reachable through it (the `workerd` build of a package, its dependencies, the files
 * of a partially traced dependency it uses) are not in the output.
 *
 * The output is used as an overlay on top of the app:
 * - Bare specifiers (`pkg`, `pkg/sub`, `#imports`) are resolved from the installed tree, from the
 *   location of the importer in the app. Packages declaring a `workerd` condition are resolved with
 *   a map keeping only that condition, so that it wins over `node` (added by the `node` platform).
 * - Imports from a file of the installed tree are resolved from the installed tree.
 * - The resolved file is replaced with its copy in the output when it exists, so that a module is
 *   bundled only once and that the code patches applied to the traced files are kept.
 *
 * Nothing has to be copied: a file missing from the output is read from the installed tree.
 */

import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type { ImportKind, OnResolveArgs, OnResolveResult, PluginBuild } from "esbuild";
import * as resolveExports from "resolve.exports";

import { type PackageJson, transformBuildCondition } from "../../utils/workerd.js";

const PLUGIN_NAME = "resolve-packages";

/** Marks a resolution started by this plugin to avoid processing it again. */
const SKIP = Symbol.for(PLUGIN_NAME);

/**
 * Creates the plugin resolving packages from the installed `node_modules`.
 *
 * @param buildOpts Build options, uses `outputDir`, `appBuildOutputPath` and `monorepoRoot`
 * @returns The esbuild plugin
 */
export function resolvePackages(
	buildOpts: Pick<BuildOptions, "outputDir" | "appBuildOutputPath" | "monorepoRoot">
) {
	return {
		name: PLUGIN_NAME,

		setup: (build: PluginBuild) => {
			const outputRoot = realpath(path.join(buildOpts.outputDir, "server-functions/default"));
			const mapper = createPathMapper(
				// Same as `getPackagePath()`
				path.join(outputRoot, path.relative(buildOpts.monorepoRoot, buildOpts.appBuildOutputPath)),
				realpath(buildOpts.appBuildOutputPath),
				outputRoot
			);
			const outputDir = realpath(buildOpts.outputDir);
			const packages = new PackageCache();

			build.onResolve({ filter: /.*/ }, async (args) => {
				if (
					args.pluginData?.[SKIP] ||
					args.namespace !== "file" ||
					!args.importer ||
					args.kind === "entry-point"
				) {
					return undefined;
				}

				const fromOutput = mapper.isInOutput(args.importer);
				const fromInstall =
					!fromOutput && isInNodeModules(args.importer) && !isInside(args.importer, outputDir);
				if (!fromOutput && !fromInstall) {
					return undefined;
				}

				const specifier = args.path;
				if (isBuiltin(specifier) || /^[a-z][a-z\d+.-]*:/i.test(specifier)) {
					return undefined;
				}

				// The importer location in the installed tree
				const importer = fromOutput ? mapper.toInstall(args.importer) : args.importer;

				if (!isRelativeOrAbsolute(specifier)) {
					const target = packages.resolveWorkerd(specifier, path.dirname(importer), args.kind);
					if (target) {
						if (target.bare) {
							// `imports` can map to a package (`"#dep": "dep"`)
							return resolveFrom(build, target.path, target.from, args, mapper);
						}
						if (mapper.isFile(target.path)) {
							return { path: mapper.preferOutput(target.path) };
						}
						logger.debug(`${PLUGIN_NAME}: ${target.path} does not exist`);
					}
					return resolveFrom(build, specifier, path.dirname(importer), args, mapper);
				}

				if (fromInstall) {
					return resolveFrom(build, specifier, args.resolveDir, args, mapper);
				}

				// Relative imports from the output are resolved by esbuild
				return undefined;
			});
		},
	};
}

/**
 * Resolves a specifier from a directory with esbuild and replaces the result with its copy in the output.
 *
 * @returns The esbuild result, `undefined` to let esbuild resolve the import itself
 */
async function resolveFrom(
	build: PluginBuild,
	specifier: string,
	resolveDir: string,
	args: OnResolveArgs,
	mapper: PathMapper
): Promise<OnResolveResult | undefined> {
	const result = await build.resolve(specifier, {
		kind: args.kind,
		importer: args.importer,
		resolveDir,
		with: args.with,
		pluginData: { ...args.pluginData, [SKIP]: true },
	});
	if (result.errors.length > 0) {
		// Let esbuild report the error from the original location
		return undefined;
	}
	if (result.external || result.namespace !== "file") {
		return result;
	}
	return { ...result, path: mapper.preferOutput(result.path) };
}

interface PathMapper {
	/** Whether a file exists */
	isFile(file: string): boolean;
	/** Whether a path is in the output */
	isInOutput(file: string): boolean;
	/** Maps a path in the output to the same location in the installed tree */
	toInstall(file: string): string;
	/** Returns the copy of a file of the installed tree in the output if it exists, the file otherwise */
	preferOutput(file: string): string;
}

/**
 * Maps the output to the installed tree.
 *
 * The output mirrors the app: `copyTracedFiles` copies `<appBuildOutputPath>/<rel>` to
 * `<output>/<packagePath>/<rel>`, including the `node_modules` of the monorepo (`<rel>` starting with `..`).
 *
 * @param outputAppDir The app directory in the output (`<output>/<packagePath>`)
 * @param appDir The app directory (`appBuildOutputPath`)
 * @param outputRoot The output root (`.open-next/server-functions/default`)
 * @returns The mapper
 */
export function createPathMapper(outputAppDir: string, appDir: string, outputRoot: string): PathMapper {
	const existsCache = new Map<string, boolean>();
	const isFile = (file: string) => {
		let exists = existsCache.get(file);
		if (exists === undefined) {
			exists = fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
			existsCache.set(file, exists);
		}
		return exists;
	};

	return {
		isFile,
		isInOutput: (file) => isInside(file, outputRoot),
		toInstall: (file) => path.join(appDir, path.relative(outputAppDir, file)),
		preferOutput: (file) => {
			if (isInside(file, outputRoot)) {
				return file;
			}
			const copy = path.join(outputAppDir, path.relative(appDir, file));
			return isInside(copy, outputRoot) && isFile(copy) ? copy : file;
		},
	};
}

interface PackageInfo {
	/** Real directory of the package */
	dir: string;
	/** `exports` keeping only the `workerd` condition, `undefined` when it has no `workerd` condition */
	exports?: resolveExports.Exports;
	/** `imports` keeping only the `workerd` condition, `undefined` when it has no `workerd` condition */
	imports?: resolveExports.Imports;
}

/**
 * Reads and caches the `package.json` of the installed packages.
 */
class PackageCache {
	private readonly byDir = new Map<string, PackageInfo | null>();

	/**
	 * Resolves a bare specifier when the target package declares a `workerd` condition for it.
	 *
	 * @param specifier `pkg`, `pkg/sub/path`, `@scope/pkg/sub/path` or `#name`
	 * @param fromDir Directory of the importer in the installed tree
	 * @param kind Kind of import, selects the `import` or `require` condition
	 * @returns The resolved file, a bare specifier to resolve from `from` (`imports` only), or
	 *          `undefined` when the package has no `workerd` condition for the specifier
	 */
	resolveWorkerd(
		specifier: string,
		fromDir: string,
		kind: ImportKind
	): { path: string; bare: false } | { path: string; bare: true; from: string } | undefined {
		if (specifier.startsWith("#")) {
			const pkg = this.findScope(fromDir);
			if (!pkg?.imports) {
				return undefined;
			}
			const target = resolveMap(pkg, specifier, kind);
			if (target === undefined) {
				return undefined;
			}
			return target.startsWith("./")
				? { path: path.join(pkg.dir, target), bare: false }
				: { path: target, bare: true, from: pkg.dir };
		}

		const { name, subpath } = parseSpecifier(specifier);
		const pkg = this.findPackage(name, fromDir);
		if (!pkg?.exports) {
			return undefined;
		}
		const target = resolveMap(pkg, subpath, kind);
		if (target === undefined) {
			return undefined;
		}
		return { path: path.join(pkg.dir, target), bare: false };
	}

	/**
	 * Finds a package as Node.js does, looking up the `node_modules` folders from `fromDir`.
	 */
	private findPackage(name: string, fromDir: string): PackageInfo | undefined {
		let dir = fromDir;
		while (true) {
			if (path.basename(dir) !== "node_modules") {
				const info = this.read(path.join(dir, "node_modules", name));
				if (info) {
					return info;
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
	 * Finds the package containing `fromDir`, the scope of `#imports`.
	 */
	private findScope(fromDir: string): PackageInfo | undefined {
		let dir = fromDir;
		while (path.basename(dir) !== "node_modules") {
			const info = this.read(dir);
			if (info) {
				return info;
			}
			const parent = path.dirname(dir);
			if (parent === dir) {
				return undefined;
			}
			dir = parent;
		}
		return undefined;
	}

	private read(dir: string): PackageInfo | undefined {
		let info = this.byDir.get(dir);
		if (info === undefined) {
			info = readPackageInfo(dir);
			this.byDir.set(dir, info);
		}
		return info ?? undefined;
	}
}

/**
 * Reads the `package.json` of a directory.
 *
 * @returns The package info or `null` when the directory has no (valid) `package.json`
 */
function readPackageInfo(dir: string): PackageInfo | null {
	let json: PackageJson;
	try {
		json = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
	} catch {
		return null;
	}
	if (typeof json !== "object" || json == null) {
		return null;
	}
	const info: PackageInfo = { dir: realpath(dir) };
	if (typeof json.exports === "object" && json.exports != null && !Array.isArray(json.exports)) {
		const { transformedExports, hasBuildCondition } = transformBuildCondition(json.exports, "workerd");
		if (hasBuildCondition) {
			info.exports = transformedExports as resolveExports.Exports;
		}
	}
	if (typeof json.imports === "object" && json.imports != null) {
		const { transformedExports, hasBuildCondition } = transformBuildCondition(json.imports, "workerd");
		if (hasBuildCondition) {
			info.imports = transformedExports as resolveExports.Imports;
		}
	}
	return info;
}

/**
 * Resolves a subpath of a package with its `exports` or `imports` keeping only the `workerd` condition.
 *
 * The active conditions are the ones of esbuild on the `node` platform with `conditions: ["workerd"]`:
 * `workerd`, `node`, `import` or `require` (depending on the kind) and `default`.
 *
 * @param pkg The package
 * @param entry `.` or `./sub/path` for `exports`, `#name` for `imports`
 * @param kind Kind of import, selects the `import` or `require` condition
 * @returns The first target (`./file.js`, or a bare specifier for `imports`), `undefined` when not exported
 */
function resolveMap(pkg: PackageInfo, entry: string, kind: ImportKind): string | undefined {
	// `node`, `import`/`require` and `default` are added by `resolve.exports`
	const options = { conditions: ["workerd"], require: isRequire(kind) };
	// `name` is only used to strip the package name from the entry and in error messages
	const json = { name: pkg.dir, exports: pkg.exports, imports: pkg.imports };
	try {
		const targets = entry.startsWith("#")
			? resolveExports.imports(json, entry, options)
			: resolveExports.exports(json, entry, options);
		return targets?.[0];
	} catch (e) {
		// i.e. `Missing "./sub" specifier in "pkg" package`
		logger.debug(`${PLUGIN_NAME}: ${e instanceof Error ? e.message : e}`);
		return undefined;
	}
}

/**
 * Splits a bare specifier into the package name and the subpath (`.` or `./sub/path`).
 */
export function parseSpecifier(specifier: string): { name: string; subpath: string } {
	const segments = specifier.split("/");
	const length = specifier.startsWith("@") ? 2 : 1;
	const name = segments.slice(0, length).join("/");
	const rest = segments.slice(length).join("/");
	return { name, subpath: rest ? `./${rest}` : "." };
}

function isRequire(kind: ImportKind): boolean {
	return kind === "require-call" || kind === "require-resolve";
}

function isRelativeOrAbsolute(specifier: string): boolean {
	return /^\.\.?(?:[\\/]|$)/.test(specifier) || path.isAbsolute(specifier);
}

function isInNodeModules(file: string): boolean {
	return /[\\/]node_modules[\\/]/.test(file);
}

function isInside(file: string, dir: string): boolean {
	const relative = path.relative(dir, file);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function realpath(file: string): string {
	try {
		return fs.realpathSync(file);
	} catch {
		return file;
	}
}
