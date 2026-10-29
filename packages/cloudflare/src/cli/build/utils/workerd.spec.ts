import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import logger from "@opennextjs/aws/logger.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { copyWorkerdPackages, transformBuildCondition, transformPackageJson } from "./workerd.js";

describe("transformBuildCondition", () => {
	test("top level", () => {
		const exports = {
			workerd: "./path/to/workerd.js",
			default: "./path/to/default.js",
		};

		const workerd = transformBuildCondition(exports, "workerd");
		const defaultExport = transformBuildCondition(exports, "default");
		const moduleExport = transformBuildCondition(exports, "module");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			workerd: "./path/to/workerd.js",
		});
		expect(defaultExport.hasBuildCondition).toBe(true);
		expect(defaultExport.transformedExports).toEqual({
			default: "./path/to/default.js",
		});
		expect(moduleExport.hasBuildCondition).toBe(false);
		expect(moduleExport.transformedExports).toEqual({
			workerd: "./path/to/workerd.js",
			default: "./path/to/default.js",
		});
	});

	test("nested", () => {
		const exports = {
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
				default: "./server.js",
			},
		};

		const workerd = transformBuildCondition(exports, "workerd");
		const defaultExport = transformBuildCondition(exports, "default");
		const moduleExport = transformBuildCondition(exports, "module");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
				},
				default: "./server.js",
			},
		});

		expect(defaultExport.hasBuildCondition).toBe(true);
		expect(defaultExport.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				default: "./server.js",
			},
		});

		expect(moduleExport.hasBuildCondition).toBe(false);
		expect(moduleExport.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
				default: "./server.js",
			},
		});
	});

	test("object-valued condition", () => {
		const exports = {
			".": "/path/to/index.js",
			"./server": {
				workerd: {
					default: "./server.edge.js",
				},
			},
		};

		const workerd = transformBuildCondition(exports, "workerd");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				workerd: {
					default: "./server.edge.js",
				},
			},
		});
	});

	test("preserve sibling subtree that nests the condition", () => {
		const exports = {
			"react-server": {
				workerd: "./rsc.edge.js",
			},
			workerd: "./top.edge.js",
		};

		const workerd = transformBuildCondition(exports, "workerd");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			"react-server": {
				workerd: "./rsc.edge.js",
			},
			workerd: "./top.edge.js",
		});
	});
});

describe("transformPackageJson", () => {
	test("no exports nor imports", () => {
		const json = {
			name: "test",
			main: "index.js",
			version: "1.0.0",
			description: "test package",
		};

		const { transformed, hasBuildCondition } = transformPackageJson(json);

		expect(transformed).toEqual(json);
		expect(hasBuildCondition).toBe(false);
	});

	test("exports only with no workerd condition", () => {
		const json = {
			name: "test",
			exports: {
				".": "./index.js",
				"./server": "./server.js",
			},
		};

		const { transformed, hasBuildCondition } = transformPackageJson(json);

		expect(transformed).toEqual(json);
		expect(hasBuildCondition).toBe(false);
	});

	test("exports as a string", () => {
		const json = {
			name: "test",
			exports: "./index.js",
		};

		const { transformed, hasBuildCondition } = transformPackageJson(json);

		expect(transformed).toEqual(json);
		expect(hasBuildCondition).toBe(false);
	});

	test("exports only with nested workerd condition", () => {
		const json = {
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
				},
			},
		});
		expect(hasBuildCondition).toBe(true);
	});

	test("imports only with top level workerd condition", () => {
		const json = {
			name: "test",
			imports: {
				workerd: "./server.edge.js",
				default: "./server.js",
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "test",
			imports: {
				workerd: "./server.edge.js",
			},
		});
		expect(hasBuildCondition).toBe(true);
	});

	// https://github.com/opennextjs/opennextjs-cloudflare/issues/1153
	// Matches the exports field of pg-cloudflare@1.3.0.
	test("exports with object-valued workerd condition (pg-cloudflare)", () => {
		const json = {
			name: "pg-cloudflare",
			exports: {
				".": {
					workerd: {
						import: "./esm/index.mjs",
						require: "./dist/index.js",
					},
					default: "./dist/empty.js",
				},
				"./package.json": "./package.json",
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "pg-cloudflare",
			exports: {
				".": {
					workerd: {
						import: "./esm/index.mjs",
						require: "./dist/index.js",
					},
				},
				"./package.json": "./package.json",
			},
		});
		expect(hasBuildCondition).toBe(true);
	});

	test("exports and imports with workerd condition both nested and top level", () => {
		const json = {
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
			},
			imports: {
				workerd: "./server.edge.js",
				default: "./server.js",
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
				},
			},
			imports: {
				workerd: "./server.edge.js",
			},
		});
		expect(hasBuildCondition).toBe(true);
	});
});

describe("copyWorkerdPackages", () => {
	let appPath: string;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	/**
	 * Creates a package in the app `node_modules` (source) and its traced copy in the output (destination).
	 *
	 * The package is installed in the pnpm layout (`node_modules/.pnpm/<name>@<version>/node_modules/<name>`)
	 * when a version is given.
	 *
	 * @param name Name of the package
	 * @param packageJson Content of the `package.json`, written to both the source and the destination
	 * @param srcFiles Files only present in the source, as the trace does not include them
	 * @param dstFiles Files present in both the source and the destination, as the trace includes them
	 * @param version Version of the package, for the pnpm layout
	 * @returns The source and destination directories of the package
	 */
	function createPackage(
		name: string,
		packageJson: object,
		srcFiles: Record<string, string>,
		dstFiles: Record<string, string>,
		version?: string
	) {
		const modulesDir = version
			? path.join("node_modules/.pnpm", `${name.replace("/", "+")}@${version}`, "node_modules")
			: "node_modules";
		const src = path.join(appPath, modulesDir, name);
		const dst = path.join(appPath, ".open-next/server-functions/default", modulesDir, name);
		const write = (dir: string, files: Record<string, string>) => {
			for (const [file, content] of Object.entries(files)) {
				fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
				fs.writeFileSync(path.join(dir, file), content);
			}
		};
		const pkgJson = { "package.json": JSON.stringify(packageJson, null, 2) };
		write(src, { ...pkgJson, ...srcFiles, ...dstFiles });
		write(dst, { ...pkgJson, ...dstFiles });
		return { src, dst };
	}

	beforeEach(() => {
		appPath = fs.mkdtempSync(path.join(os.tmpdir(), "copy-workerd-packages-"));
		errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		fs.rmSync(appPath, { recursive: true, force: true });
	});

	// Matches pg-cloudflare@1.4.1, a dependency of `pg` that nobody lists in `serverExternalPackages`.
	test("copies the workerd build of a traced package without any serverExternalPackages configuration", async () => {
		const { src, dst } = createPackage(
			"pg-cloudflare",
			{
				name: "pg-cloudflare",
				exports: {
					".": {
						workerd: {
							import: "./esm/index.mjs",
							require: "./dist/index.js",
						},
						default: "./dist/empty.js",
					},
					"./package.json": "./package.json",
				},
			},
			{
				"dist/index.js": "exports.CloudflareSocket = class {};",
				"esm/index.mjs": "export class CloudflareSocket {}",
			},
			{ "dist/empty.js": "module.exports = {};" },
			"1.4.1"
		);

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		expect(fs.readFileSync(path.join(dst, "dist/index.js"), "utf8")).toBe(
			"exports.CloudflareSocket = class {};"
		);
		expect(fs.readFileSync(path.join(dst, "esm/index.mjs"), "utf8")).toBe("export class CloudflareSocket {}");
		expect(JSON.parse(fs.readFileSync(path.join(dst, "package.json"), "utf8"))).toEqual({
			name: "pg-cloudflare",
			exports: {
				".": {
					workerd: {
						import: "./esm/index.mjs",
						require: "./dist/index.js",
					},
				},
				"./package.json": "./package.json",
			},
		});
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test.each([
		[
			"without a workerd condition",
			{ name: "pkg", exports: { ".": { import: "./index.mjs", require: "./index.js" } } },
		],
		["whose exports is a string", { name: "pkg", exports: "./index.js" }],
	])("leaves a traced package %s untouched", async (_, packageJson) => {
		const { src, dst } = createPackage(
			"pkg",
			packageJson,
			{ "untraced.js": "module.exports = {};" },
			{ "index.js": "module.exports = {};" }
		);

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		expect(fs.existsSync(path.join(dst, "untraced.js"))).toBe(false);
		expect(fs.readFileSync(path.join(dst, "package.json"), "utf8")).toBe(
			JSON.stringify(packageJson, null, 2)
		);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("copies the workerd build of a scoped package", async () => {
		const { src, dst } = createPackage(
			"@scope/pkg",
			{ name: "@scope/pkg", exports: { workerd: "./workerd.js", default: "./node.js" } },
			{ "workerd.js": "export const runtime = 'workerd';" },
			{ "node.js": "export const runtime = 'node';" },
			"1.0.0"
		);

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		expect(fs.existsSync(path.join(dst, "workerd.js"))).toBe(true);
		expect(JSON.parse(fs.readFileSync(path.join(dst, "package.json"), "utf8"))).toEqual({
			name: "@scope/pkg",
			exports: { workerd: "./workerd.js" },
		});
		expect(errorSpy).not.toHaveBeenCalled();
	});

	// Matches the client generated by `prisma-client-js` (Prisma 6) into `node_modules/.prisma/client`.
	// `#main-entry-point` lists `node` before `workerd`: esbuild adds the `node` condition on the node
	// platform and picks the first matching key, so the rewrite is what makes the `wasm` build win.
	test("copies the workerd build of a package generated in a dot folder (.prisma/client)", async () => {
		const packageJson = {
			name: "prisma-client-abc123",
			exports: {
				".": {
					require: { node: "./index.js", workerd: "./wasm.js", default: "./index.js" },
					default: "./index.js",
				},
				"./*": "./*",
			},
			imports: {
				"#wasm-engine-loader": { workerd: "./wasm-worker-loader.mjs", default: "./wasm-worker-loader.mjs" },
				"#main-entry-point": {
					require: { node: "./index.js", workerd: "./wasm.js", default: "./index.js" },
					default: "./index.js",
				},
			},
		};
		const { src, dst } = createPackage(
			".prisma/client",
			packageJson,
			{
				"wasm.js": "module.exports = require('#wasm-engine-loader');",
				"wasm-worker-loader.mjs": "export default {};",
			},
			{ "index.js": "module.exports = {};", "default.js": "module.exports = require('#main-entry-point');" },
			"6.7.0"
		);

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		expect(fs.existsSync(path.join(dst, "wasm.js"))).toBe(true);
		expect(fs.existsSync(path.join(dst, "wasm-worker-loader.mjs"))).toBe(true);
		expect(JSON.parse(fs.readFileSync(path.join(dst, "package.json"), "utf8"))).toEqual({
			name: "prisma-client-abc123",
			exports: {
				".": { require: { workerd: "./wasm.js" }, default: "./index.js" },
				"./*": "./*",
			},
			imports: {
				"#wasm-engine-loader": { workerd: "./wasm-worker-loader.mjs" },
				"#main-entry-point": { require: { workerd: "./wasm.js" }, default: "./index.js" },
			},
		});
		expect(errorSpy).not.toHaveBeenCalled();
	});
	// Nested `package.json` files are module type markers (`{ "type": "module" }`), not packages.
	test("ignores a traced package.json nested in a package", async () => {
		const { src, dst } = createPackage(
			"nested",
			{ name: "nested", exports: { workerd: "./workerd.js", default: "./node.js" } },
			{ "workerd.js": "export const runtime = 'workerd';" },
			{ "node.js": "export const runtime = 'node';", "esm/package.json": '{ "type": "module" }' }
		);

		await copyWorkerdPackages({ appPath }, new Map([[path.join(src, "esm"), path.join(dst, "esm")]]));

		expect(fs.existsSync(path.join(dst, "workerd.js"))).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	// The trace lists the `package.json` of the app itself, it must not be copied into its own output.
	test("ignores a traced package.json outside of node_modules", async () => {
		const packageJson = {
			name: "app",
			imports: { "#db": { workerd: "./db.workerd.js", default: "./db.js" } },
		};
		fs.writeFileSync(path.join(appPath, "package.json"), JSON.stringify(packageJson, null, 2));
		fs.writeFileSync(path.join(appPath, "db.workerd.js"), "export const db = 'workerd';");
		const dst = path.join(appPath, ".open-next/server-functions/default");
		fs.mkdirSync(dst, { recursive: true });

		await copyWorkerdPackages({ appPath }, new Map([[appPath, dst]]));

		expect(fs.existsSync(path.join(dst, "db.workerd.js"))).toBe(false);
		expect(fs.existsSync(path.join(dst, "package.json"))).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	/**
	 * Installs a package in the pnpm store and links it next to `dependent` as pnpm does for its dependencies.
	 *
	 * The package is not traced: it only exists in the installed tree.
	 *
	 * @param dependent Installed directory of the package depending on `name`
	 * @param name Name of the dependency
	 * @param version Version of the dependency
	 * @param packageJson Content of the `package.json`
	 * @param files Files of the dependency
	 * @returns The installed directory of the dependency
	 */
	function installDependency(
		dependent: string,
		name: string,
		version: string,
		packageJson: object,
		files: Record<string, string>
	) {
		const real = path.join(appPath, "node_modules/.pnpm", `${name}@${version}`, "node_modules", name);
		fs.mkdirSync(real, { recursive: true });
		fs.writeFileSync(path.join(real, "package.json"), JSON.stringify(packageJson, null, 2));
		for (const [file, content] of Object.entries(files)) {
			fs.writeFileSync(path.join(real, file), content);
		}
		const link = path.join(path.dirname(dependent), name);
		fs.symlinkSync(path.relative(path.dirname(link), real), link);
		return real;
	}

	test("copies the untraced dependencies of a workerd build", async () => {
		const { src, dst } = createPackage(
			"socket-adapter",
			{
				name: "socket-adapter",
				exports: { workerd: "./workerd.js", default: "./node.js" },
				dependencies: { "worker-transport": "1.0.0" },
				optionalDependencies: { "not-installed": "1.0.0" },
			},
			{ "workerd.js": "export { connect } from 'worker-transport';" },
			{ "node.js": "export const connect = () => {};" },
			"1.0.0"
		);
		const transport = installDependency(
			src,
			"worker-transport",
			"1.0.0",
			{ name: "worker-transport", dependencies: { "transport-core": "1.0.0" } },
			{ "index.js": "export { connect } from 'transport-core';" }
		);
		installDependency(
			transport,
			"transport-core",
			"1.0.0",
			{ name: "transport-core" },
			{ "index.js": "export const connect = () => {};" }
		);

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		const dstStore = path.join(appPath, ".open-next/server-functions/default/node_modules/.pnpm");
		const transportDst = path.join(dstStore, "worker-transport@1.0.0/node_modules/worker-transport");
		const coreDst = path.join(dstStore, "transport-core@1.0.0/node_modules/transport-core");
		expect(fs.readFileSync(path.join(transportDst, "index.js"), "utf8")).toBe(
			"export { connect } from 'transport-core';"
		);
		expect(fs.readFileSync(path.join(coreDst, "index.js"), "utf8")).toBe("export const connect = () => {};");
		// The symlinks pnpm uses to expose the dependencies are recreated in the output
		const transportLink = path.join(path.dirname(dst), "worker-transport");
		expect(fs.readlinkSync(transportLink)).toBe("../../worker-transport@1.0.0/node_modules/worker-transport");
		expect(fs.realpathSync(transportLink)).toBe(fs.realpathSync(transportDst));
		const coreLink = path.join(path.dirname(transportDst), "transport-core");
		expect(fs.readlinkSync(coreLink)).toBe("../../transport-core@1.0.0/node_modules/transport-core");
		expect(fs.realpathSync(coreLink)).toBe(fs.realpathSync(coreDst));
		expect(errorSpy).not.toHaveBeenCalled();
	});

	// The dependency can be traced for another package while the link from the workerd package is not.
	test("links the traced dependencies of a workerd build without copying them", async () => {
		const { src, dst } = createPackage(
			"socket-adapter",
			{
				name: "socket-adapter",
				exports: { workerd: "./workerd.js", default: "./node.js" },
				dependencies: { "traced-dep": "1.0.0" },
			},
			{ "workerd.js": "export { connect } from 'traced-dep';" },
			{ "node.js": "export const connect = () => {};" },
			"1.0.0"
		);
		const dep = createPackage(
			"traced-dep",
			{ name: "traced-dep" },
			{ "untraced.js": "export const unused = true;" },
			{ "index.js": "export const connect = () => {};" },
			"1.0.0"
		);
		const link = path.join(path.dirname(src), "traced-dep");
		fs.symlinkSync(path.relative(path.dirname(link), dep.src), link);

		await copyWorkerdPackages(
			{ appPath },
			new Map([
				[src, dst],
				[dep.src, dep.dst],
			])
		);

		expect(fs.existsSync(path.join(dst, "workerd.js"))).toBe(true);
		expect(fs.existsSync(path.join(dep.dst, "index.js"))).toBe(true);
		expect(fs.existsSync(path.join(dep.dst, "untraced.js"))).toBe(false);
		expect(fs.realpathSync(path.join(path.dirname(dst), "traced-dep"))).toBe(fs.realpathSync(dep.dst));
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("copies the untraced dependencies of a workerd build in the hoisted layout", async () => {
		const { src, dst } = createPackage(
			"socket-adapter",
			{
				name: "socket-adapter",
				exports: { workerd: "./workerd.js", default: "./node.js" },
				dependencies: { "worker-transport": "1.0.0" },
			},
			{ "workerd.js": "export { connect } from 'worker-transport';" },
			{ "node.js": "export const connect = () => {};" }
		);
		const transport = path.join(appPath, "node_modules/worker-transport");
		fs.mkdirSync(transport, { recursive: true });
		fs.writeFileSync(path.join(transport, "package.json"), '{ "name": "worker-transport" }');
		fs.writeFileSync(path.join(transport, "index.js"), "export const connect = () => {};");

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		const transportDst = path.join(path.dirname(dst), "worker-transport");
		expect(fs.lstatSync(transportDst).isDirectory()).toBe(true);
		expect(fs.readFileSync(path.join(transportDst, "index.js"), "utf8")).toBe(
			"export const connect = () => {};"
		);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("copies untraced dependencies depending on each other", async () => {
		const { src, dst } = createPackage(
			"socket-adapter",
			{
				name: "socket-adapter",
				exports: { workerd: "./workerd.js", default: "./node.js" },
				dependencies: { "dep-a": "1.0.0" },
			},
			{ "workerd.js": "export * from 'dep-a';" },
			{ "node.js": "export const connect = () => {};" },
			"1.0.0"
		);
		const depA = installDependency(
			src,
			"dep-a",
			"1.0.0",
			{ name: "dep-a", dependencies: { "dep-b": "1.0.0" } },
			{ "index.js": "export * from 'dep-b';" }
		);
		const depB = installDependency(
			depA,
			"dep-b",
			"1.0.0",
			{ name: "dep-b", dependencies: { "dep-a": "1.0.0" } },
			{ "index.js": "export * from 'dep-a';" }
		);
		const linkToA = path.join(path.dirname(depB), "dep-a");
		fs.symlinkSync(path.relative(path.dirname(linkToA), depA), linkToA);

		await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

		const dstStore = path.join(appPath, ".open-next/server-functions/default/node_modules/.pnpm");
		expect(fs.existsSync(path.join(dstStore, "dep-a@1.0.0/node_modules/dep-a/index.js"))).toBe(true);
		expect(fs.existsSync(path.join(dstStore, "dep-b@1.0.0/node_modules/dep-b/index.js"))).toBe(true);
		expect(fs.realpathSync(path.join(dstStore, "dep-b@1.0.0/node_modules/dep-a"))).toBe(
			fs.realpathSync(path.join(dstStore, "dep-a@1.0.0/node_modules/dep-a"))
		);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test("does not copy a dependency installed outside of the app", async () => {
		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "copy-workerd-packages-outside-"));
		try {
			const { src, dst } = createPackage(
				"socket-adapter",
				{
					name: "socket-adapter",
					exports: { workerd: "./workerd.js", default: "./node.js" },
					dependencies: { "global-dep": "1.0.0" },
				},
				{ "workerd.js": "export * from 'global-dep';" },
				{ "node.js": "export const connect = () => {};" },
				"1.0.0"
			);
			fs.writeFileSync(path.join(outsideDir, "package.json"), '{ "name": "global-dep" }');
			fs.symlinkSync(outsideDir, path.join(path.dirname(src), "global-dep"));

			await copyWorkerdPackages({ appPath }, new Map([[src, dst]]));

			expect(fs.existsSync(path.join(dst, "workerd.js"))).toBe(true);
			expect(fs.existsSync(path.join(path.dirname(dst), "global-dep"))).toBe(false);
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});
