/**
 * ESBuild plugin resolving packages from the installed `node_modules`, preferring the traced copies.
 *
 * The server functions output (`.open-next/server-functions/default`) only contains the files traced
 * by Next.js, with the Node.js conditions. The server is bundled with the `workerd` condition, so
 * the files only reachable through it (the `workerd` build of a package, its dependencies, the files
 * of a partially traced dependency it uses) are not in the output.
 *
 * The output is used as an overlay on top of the app:
 * - Bare specifiers (`pkg`, `pkg/sub`, `#imports`) of packages declaring a `workerd` condition are
 *   resolved from the installed tree, from the location of the importer in the app, with a map keeping
 *   only that condition, so that it wins over `node` (added by the `node` platform).
 *   Other packages imported from the output are resolved by esbuild, as Next.js traced them with the
 *   conditions esbuild uses.
 * - Imports from a file of the installed tree are resolved from the installed tree.
 * - The resolved file is replaced with its copy in the output when it exists, so that a module is
 *   bundled only once and that the code patches applied to the traced files are kept.
 *
 * Nothing has to be copied: a file missing from the output is read from the installed tree.
 */

import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import type { ImportKind, OnResolveArgs, OnResolveResult, PluginBuild } from "esbuild";
import * as resolveExports from "resolve.exports";

const PLUGIN_NAME = "resolve-packages";

/** Marks a resolution started by this plugin to avoid processing it again. */
const SKIP = Symbol.for(PLUGIN_NAME);

/**
 * Creates the plugin resolving packages from the installed `node_modules`.
 *
 * @param buildOpts Build options, uses `outputDir`, `appBuildOutputPath` and `monorepoRoot`
 * @returns The esbuild plugin
 */
export function resolvePackages(buildOpts: BuildOptions) {
	return {
		name: PLUGIN_NAME,

		setup: (build: PluginBuild) => {
			const outputRoot = realpath(path.join(buildOpts.outputDir, "server-functions/default"));
			const mapper = createPathMapper(
				path.join(outputRoot, getPackagePath(buildOpts)),
				realpath(buildOpts.appBuildOutputPath),
				outputRoot
			);
			const outputDir = realpath(buildOpts.outputDir);
			const packages = new PackageCache();

			build.onResolve({ filter: /.*/ }, async (args) => {
				// Entry points have no importer
				if (args.pluginData?.[SKIP] || args.namespace !== "file" || !args.importer) {
					return undefined;
				}

				const fromOutput = mapper.isInOutput(args.importer);
				const fromInstall = isInNodeModules(args.importer) && !isInside(args.importer, outputDir);
				if (!fromOutput && !fromInstall) {
					return undefined;
				}

				const specifier = args.path;
				// Builtins and URL schemes (`cloudflare:`, `data:`, `https:`) are not packages
				if (isBuiltin(specifier) || /^[a-z][a-z\d+.-]*:/i.test(specifier)) {
					return undefined;
				}

				if (isRelativeOrAbsolute(specifier)) {
					// Relative imports from the output are resolved by esbuild
					return fromOutput ? undefined : resolveFrom(build, specifier, args.resolveDir, args, mapper);
				}

				// The importer location in the installed tree
				const resolveDir = path.dirname(fromOutput ? mapper.toInstall(args.importer) : args.importer);
				const target = packages.resolveWorkerd(specifier, resolveDir, args.kind);
				if (target === undefined) {
					// Without a `workerd` condition, Next.js traced the package with the conditions used by
					// esbuild: an import from the output is resolved by esbuild
					return fromOutput ? undefined : resolveFrom(build, specifier, resolveDir, args, mapper);
				}
				if (target.file) {
					if (mapper.isFile(target.file)) {
						// esbuild resolves the file to apply the `sideEffects` of the package
						return resolveFrom(build, mapper.preferOutput(target.file), target.from, args, mapper);
					}
					logger.debug(`${PLUGIN_NAME}: ${target.file} does not exist`);
				}
				return resolveFrom(build, target.specifier, target.from, args, mapper);
			});
		},
	};
}

/**
 * Resolves a specifier from a directory with esbuild and replaces the result with its copy in the output.
 *
 * @param build The esbuild plugin build
 * @param specifier The specifier to resolve
 * @param resolveDir The directory to resolve the specifier from
 * @param args The arguments of the original resolution (kind, importer, import attributes)
 * @param mapper Maps the installed tree to the output
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
function createPathMapper(outputAppDir: string, appDir: string, outputRoot: string): PathMapper {
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

/** The fields of a `package.json` used by the plugin */
interface PackageJson {
	exports?: unknown;
	imports?: unknown;
}

interface PackageInfo {
	/** Real directory of the package */
	dir: string;
	/** `exports` keeping only the `workerd` condition, `undefined` when it has no `workerd` condition */
	exports: resolveExports.Exports | undefined;
	/** `imports` keeping only the `workerd` condition, `undefined` when it has no `workerd` condition */
	imports: resolveExports.Imports | undefined;
}

interface WorkerdTarget {
	/** The file of the `workerd` build, when the map has a valid target */
	file?: string;
	/**
	 * The specifier to resolve when there is no file or when it does not exist: the one imported, or the
	 * package an `imports` maps to
	 */
	specifier: string;
	/** The directory to resolve `specifier` from */
	from: string;
}

/**
 * Reads and caches the `package.json` of the installed packages.
 */
class PackageCache {
	private readonly byDir = new Map<string, PackageInfo | null>();

	/**
	 * Resolves a bare specifier with the `workerd` condition of its package.
	 *
	 * `imports` can map to a package (`"#dep": "dep"`), which can have a `workerd` build too. The package
	 * is resolved from the scope of the `imports` (a `#` target is not followed).
	 *
	 * @param specifier `pkg`, `pkg/sub/path`, `@scope/pkg/sub/path` or `#name`
	 * @param fromDir Directory of the importer in the installed tree
	 * @param kind Kind of import, selects the `import` or `require` condition
	 * @returns `undefined` when the package has no `workerd` condition (in its `exports`, or in the
	 *          `imports` of the scope for `#name`), the target otherwise
	 */
	resolveWorkerd(specifier: string, fromDir: string, kind: ImportKind): WorkerdTarget | undefined {
		const name = specifier.startsWith("#") ? undefined : packageName(specifier);
		const pkg = name ? this.findPackage(name, fromDir) : this.findScope(fromDir);
		if (!pkg || !(name ? pkg.exports : pkg.imports)) {
			return undefined;
		}
		// The name is only used in the error messages for `imports`
		const target = resolveTarget(pkg, name ?? pkg.dir, specifier, kind);
		if (target === undefined) {
			return { specifier, from: fromDir };
		}
		if (isPackageTarget(target)) {
			return { file: path.join(pkg.dir, target), specifier, from: fromDir };
		}
		const mapped = target.startsWith("#") ? undefined : this.resolveWorkerd(target, pkg.dir, kind);
		return mapped ?? { specifier: target, from: pkg.dir };
	}

	/**
	 * Finds a package as Node.js does, looking up the `node_modules` folders from `fromDir`.
	 *
	 * @param name The package name, `pkg` or `@scope/pkg`
	 * @param fromDir The directory to start the lookup from
	 * @returns The first package found, `undefined` when there is none
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
	 *
	 * The lookup stops at the `node_modules` folder containing the package.
	 *
	 * @param fromDir The directory to start the lookup from
	 * @returns The closest package with a `package.json`, `undefined` when there is none
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

	/**
	 * Reads the package of a directory, once.
	 *
	 * @param dir The package directory
	 * @returns The cached package info, `undefined` when the directory has no (valid) `package.json`
	 */
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
	return {
		dir: realpath(dir),
		exports: keepCondition(json.exports, "workerd") as resolveExports.Exports | undefined,
		imports: keepCondition(json.imports, "workerd") as resolveExports.Imports | undefined,
	};
}

/**
 * Keeps only a condition of an `exports` or `imports` map.
 *
 * In a conditions object with the condition, the other keys are dropped, except the subtrees that
 * contain the condition. Arrays of alternative targets are kept, their objects are transformed.
 * The subtrees without the condition are not copied, they are shared with `map`.
 *
 * @param map The `exports` or `imports` of a `package.json`
 * @param condition The condition to keep, i.e. `workerd`
 * @returns The transformed map, `undefined` when the map does not have the condition
 */
export function keepCondition(map: unknown, condition: string): { [key: string]: unknown } | undefined {
	if (typeof map !== "object" || map == null || Array.isArray(map)) {
		return undefined;
	}
	const { value, found } = transform(map, condition);
	return found ? (value as { [key: string]: unknown }) : undefined;
}

/**
 * Keeps only a condition of a value of an `exports` or `imports` map, recursively.
 *
 * In an object with the condition, the other keys are dropped, except the subtrees that contain the
 * condition. Objects and arrays are transformed recursively, other values (targets, `null`) are kept.
 *
 * The value is returned as is when it does not contain the condition, at any depth: it is not copied.
 * The returned value can then share objects with the input.
 *
 * @param value A target, a conditions or subpaths object, or an array of alternatives
 * @param condition The condition to keep
 * @returns The transformed value and whether it contains the condition
 */
function transform(value: unknown, condition: string): { value: unknown; found: boolean } {
	if (Array.isArray(value)) {
		const items = value.map((item: unknown) => transform(item, condition));
		const found = items.some((item) => item.found);
		return { value: found ? items.map((item) => item.value) : value, found };
	}
	if (typeof value !== "object" || value == null) {
		return { value, found: false };
	}
	const entries = Object.entries(value);
	const hasCondition = entries.some(([key, child]) => key === condition && child != null);
	const kept: { [key: string]: unknown } = {};
	let found = hasCondition;
	for (const [key, child] of entries) {
		const result = transform(child, condition);
		// Next to the condition, the siblings that do not contain it are dropped
		if (!hasCondition || key === condition || result.found) {
			kept[key] = result.value;
			found ||= result.found;
		}
	}
	return { value: found ? kept : value, found };
}

/**
 * Resolves a specifier with the `exports` or `imports` of a package keeping only the `workerd` condition.
 *
 * The active conditions are the ones of esbuild on the `node` platform with `conditions: ["workerd"]`:
 * `workerd`, `node`, `import` or `require` (depending on the kind) and `default`.
 * As Node.js does, the first valid target of an array of alternatives is used.
 *
 * @param pkg The package
 * @param name The package name from the specifier, stripped from it. Not the `name` of the
 *             `package.json`, which differs for aliased installs. Only used in the errors for `imports`.
 * @param specifier `pkg`, `pkg/sub/path` or `#name`
 * @param kind Kind of import, selects the `import` or `require` condition
 * @returns The first valid target (`./file.js`, or a package for `imports`), `undefined` when none
 */
function resolveTarget(
	pkg: PackageInfo,
	name: string,
	specifier: string,
	kind: ImportKind
): string | undefined {
	let targets: string[];
	try {
		// `node`, `import`/`require` and `default` are added by `resolve.exports`
		targets =
			resolveExports.resolve({ name, exports: pkg.exports, imports: pkg.imports }, specifier, {
				conditions: ["workerd"],
				require: isRequire(kind),
			}) ?? [];
	} catch (e) {
		// i.e. `Missing "./sub" specifier in "pkg" package`
		logger.debug(`${PLUGIN_NAME}: ${e instanceof Error ? e.message : e}`);
		return undefined;
	}
	const isImport = specifier.startsWith("#");
	const target = targets.find((target) => isPackageTarget(target) || (isImport && isBareTarget(target)));
	if (target === undefined && targets.length > 0) {
		logger.debug(
			`${PLUGIN_NAME}: invalid targets ${JSON.stringify(targets)} for "${specifier}" in ${pkg.dir}`
		);
	}
	return target;
}

/**
 * Returns the package name of a bare specifier.
 *
 * @param specifier `pkg`, `pkg/sub/path`, `@scope/pkg` or `@scope/pkg/sub/path`
 * @returns `pkg` or `@scope/pkg`
 */
export function packageName(specifier: string): string {
	return specifier.split("/", specifier.startsWith("@") ? 2 : 1).join("/");
}

/**
 * Whether a target of an `exports` or `imports` map is a file of the package.
 *
 * As Node.js requires, the target starts with `./` and has no empty, `.`, `..` or `node_modules` segment.
 * `resolve.exports` does not validate the targets.
 *
 * @param target The target returned by `resolve.exports`
 * @returns Whether the target is valid
 */
export function isPackageTarget(target: string): boolean {
	return (
		target.startsWith("./") &&
		target
			.slice(2)
			.split(/[\\/]/)
			.every(
				(segment) =>
					segment !== "" && segment !== "." && segment !== ".." && segment.toLowerCase() !== "node_modules"
			)
	);
}

/**
 * Whether a target of an `imports` map is a package specifier (`"#dep": "dep"`).
 *
 * @param target The target returned by `resolve.exports`
 * @returns Whether the target is a bare specifier
 */
function isBareTarget(target: string): boolean {
	return target !== "" && !target.startsWith(".") && !target.startsWith("/") && !path.isAbsolute(target);
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

/**
 * Whether a path is inside a directory.
 *
 * @param file The path to check
 * @param dir The directory
 * @returns `true` when `file` is in `dir` or in one of its subdirectories, `false` for `dir` itself
 */
function isInside(file: string, dir: string): boolean {
	const relative = path.relative(dir, file);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Resolves the symlinks of a path.
 *
 * @param file The path
 * @returns The real path, or `file` when it can not be resolved (i.e. it does not exist)
 */
function realpath(file: string): string {
	try {
		return fs.realpathSync(file);
	} catch {
		return file;
	}
}
