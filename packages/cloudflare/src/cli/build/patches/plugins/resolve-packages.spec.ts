import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build, type Plugin } from "esbuild";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { serverExternals } from "../../bundle-server.js";
import { handleOptionalDependencies } from "./optional-deps.js";
import { isPackageTarget, keepCondition, packageName, resolvePackages } from "./resolve-packages.js";
import { setWranglerExternal } from "./wrangler-external.js";

const OUTPUT = ".open-next/server-functions/default";

describe("resolvePackages", () => {
	let root: string;

	beforeEach(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "resolve-packages-")));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	/**
	 * Writes files relative to the root of the test.
	 *
	 * A value starting with `->` creates a symlink to the given (relative) target.
	 */
	function write(files: Record<string, string | object>) {
		for (const [file, content] of Object.entries(files)) {
			const filePath = path.join(root, file);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			if (typeof content === "string" && content.startsWith("->")) {
				fs.symlinkSync(content.slice(2), filePath);
			} else {
				fs.writeFileSync(filePath, typeof content === "string" ? content : JSON.stringify(content));
			}
		}
	}

	/**
	 * Writes the same files to the app (installed tree) and to the output (traced copy).
	 *
	 * @param files The files, relative to the app
	 * @param appDir The app directory, relative to the root
	 * @param output The output, relative to the app
	 */
	function writeTraced(files: Record<string, string | object>, appDir = "", output = OUTPUT) {
		write(
			Object.fromEntries(Object.entries(files).map(([file, content]) => [path.join(appDir, file), content]))
		);
		write(
			Object.fromEntries(
				Object.entries(files).map(([file, content]) => [path.join(appDir, output, appDir, file), content])
			)
		);
	}

	/**
	 * Bundles an entry point of the output with the `workerd` condition, as `bundleServer` does.
	 *
	 * @param entry The entry point, relative to the app in the output
	 * @param appDir The app directory, relative to the root
	 * @param plugins The plugins registered before `resolvePackages`
	 * @param output The output, relative to the app
	 * @returns The bundled code and the bundled files, relative to the root
	 */
	async function bundle(entry: string, appDir = "", plugins: Plugin[] = [], output = OUTPUT) {
		const appPath = path.join(root, appDir);
		const result = await build({
			entryPoints: [path.join(appPath, output, appDir, entry)],
			absWorkingDir: root,
			bundle: true,
			write: false,
			metafile: true,
			format: "esm",
			platform: "node",
			conditions: ["workerd"],
			external: serverExternals,
			logLevel: "silent",
			plugins: [
				...plugins,
				resolvePackages(
					{
						outputDir: path.join(appPath, ".open-next"),
						appBuildOutputPath: appPath,
						monorepoRoot: root,
					} as BuildOptions,
					path.join(appPath, output)
				),
			],
		});
		return { code: result.outputFiles[0]!.text, inputs: Object.keys(result.metafile.inputs).sort() };
	}

	// Matches pg-cloudflare@1.4.1: Next.js only traces `dist/empty.js` (#1214, #1322).
	test("resolves the untraced workerd build of a traced package", async () => {
		const pgCloudflare = {
			name: "pg-cloudflare",
			exports: {
				".": {
					workerd: { import: "./esm/index.mjs", require: "./dist/index.js" },
					default: "./dist/empty.js",
				},
			},
		};
		writeTraced({
			"node_modules/pg/package.json": { name: "pg" },
			"node_modules/pg/index.js": "module.exports = require('pg-cloudflare');",
			"node_modules/pg-cloudflare/package.json": pgCloudflare,
			"node_modules/pg-cloudflare/dist/empty.js": "module.exports = {};",
			".next/server/route.js": "export * from 'pg';",
		});
		write({ "node_modules/pg-cloudflare/dist/index.js": "exports.CloudflareSocket = 'workerd';" });

		const { code, inputs } = await bundle(".next/server/route.js");

		expect(code).toContain('CloudflareSocket = "workerd"');
		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/pg/index.js`,
			"node_modules/pg-cloudflare/dist/index.js",
		]);
	});

	// Matches `@sentry/nextjs` with `serverExternalPackages: ["@sentry/nextjs"]` (#1478).
	test("resolves the untraced dependencies and the untraced files of partially traced dependencies", async () => {
		writeTraced({
			"node_modules/@sentry/nextjs/package.json": {
				name: "@sentry/nextjs",
				exports: { ".": { workerd: "./edge.js", node: "./server.js" } },
			},
			"node_modules/@sentry/nextjs/server.js": "export * from '@sentry/node';",
			"node_modules/@sentry/node/package.json": { name: "@sentry/node" },
			"node_modules/@sentry/node/index.js": "export * from '@sentry/server-utils';",
			"node_modules/@sentry/server-utils/package.json": {
				name: "@sentry/server-utils",
				exports: { ".": "./index.js", "./no-diagnostic-channels": "./index.no-dc.js" },
			},
			"node_modules/@sentry/server-utils/index.js": "export * from './shared.js';",
			"node_modules/@sentry/server-utils/shared.js": "export const shared = 'traced copy';",
			".next/server/route.js": "export * from '@sentry/nextjs'; export * from '@sentry/server-utils';",
		});
		write({
			// Only the workerd build uses these files, they are not traced
			"node_modules/@sentry/nextjs/edge.js": "export * from '@sentry/vercel-edge';",
			"node_modules/@sentry/vercel-edge/package.json": { name: "@sentry/vercel-edge" },
			"node_modules/@sentry/vercel-edge/index.js":
				"export * from '@sentry/server-utils/no-diagnostic-channels';",
			"node_modules/@sentry/server-utils/index.no-dc.js": "export * from './shared.js';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/@sentry/server-utils/index.js`,
			// The file is bundled once, from the output
			`${OUTPUT}/node_modules/@sentry/server-utils/shared.js`,
			"node_modules/@sentry/nextjs/edge.js",
			"node_modules/@sentry/server-utils/index.no-dc.js",
			"node_modules/@sentry/vercel-edge/index.js",
		]);
	});

	// Matches the client generated by `prisma-client-js` (Prisma 6) into `node_modules/.prisma/client` (#623).
	// `node` is listed before `workerd` and esbuild adds the `node` condition on the node platform.
	test("prefers the workerd condition of #imports in a package generated in a dot folder", async () => {
		writeTraced({
			"node_modules/.prisma/client/package.json": {
				name: "prisma-client-abc123",
				imports: {
					"#main-entry-point": {
						require: { node: "./index.js", workerd: "./wasm.js", default: "./index.js" },
					},
				},
			},
			"node_modules/.prisma/client/default.js": "module.exports = require('#main-entry-point');",
			"node_modules/.prisma/client/index.js": "module.exports = 'node';",
			".next/server/route.js": "export * from '.prisma/client/default';",
		});
		write({ "node_modules/.prisma/client/wasm.js": "module.exports = 'workerd';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/.prisma/client/default.js`,
			"node_modules/.prisma/client/wasm.js",
		]);
	});

	// Matches jose@4 (#737) and postgres (#548): `import`, `require` or `default` are listed before `workerd`.
	test.each([
		["import", { import: "./node.mjs", require: "./node.cjs", workerd: "./browser.js" }],
		["default", { default: "./node.cjs", workerd: "./browser.js" }],
	])("prefers the workerd condition listed after %s", async (_, conditions) => {
		writeTraced({
			"node_modules/jose/package.json": { name: "jose", exports: { ".": conditions } },
			"node_modules/jose/node.mjs": "export const runtime = 'node';",
			"node_modules/jose/node.cjs": "exports.runtime = 'node';",
			".next/server/route.js": "export * from 'jose';",
		});
		write({ "node_modules/jose/browser.js": "export const runtime = 'workerd';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, "node_modules/jose/browser.js"]);
	});

	test("keeps the sideEffects flag of a package for its workerd build", async () => {
		writeTraced({
			"node_modules/pkg/package.json": {
				name: "pkg",
				sideEffects: false,
				exports: { ".": { workerd: "./worker.js", default: "./node.js" } },
			},
			"node_modules/pkg/node.js": "console.log('node');",
			".next/server/route.js": "import 'pkg'; export const route = 'route';",
		});
		write({ "node_modules/pkg/worker.js": "console.log('workerd');" });

		const { code } = await bundle(".next/server/route.js");

		expect(code).toContain("route");
		expect(code).not.toContain("workerd");
	});

	test("selects the import or require target of the workerd build from the kind of import", async () => {
		writeTraced({
			"node_modules/pg-cloudflare/package.json": {
				name: "pg-cloudflare",
				exports: {
					".": {
						workerd: { import: "./esm/index.mjs", require: "./dist/index.js" },
						default: "./dist/empty.js",
					},
				},
			},
			"node_modules/pg-cloudflare/dist/empty.js": "module.exports = {};",
			".next/server/route.js": "import 'pg-cloudflare'; require('pg-cloudflare');",
		});
		write({
			"node_modules/pg-cloudflare/esm/index.mjs": "export const socket = 'esm';",
			"node_modules/pg-cloudflare/dist/index.js": "exports.socket = 'cjs';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			"node_modules/pg-cloudflare/dist/index.js",
			"node_modules/pg-cloudflare/esm/index.mjs",
		]);
	});

	test("resolves a subpath pattern of the workerd build", async () => {
		writeTraced({
			"node_modules/sdk/package.json": {
				name: "sdk",
				exports: { "./*": { workerd: "./edge/*.js", default: "./node/*.js" } },
			},
			"node_modules/sdk/node/client.js": "export const runtime = 'node';",
			".next/server/route.js": "export * from 'sdk/client';",
		});
		write({ "node_modules/sdk/edge/client.js": "export const runtime = 'workerd';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, "node_modules/sdk/edge/client.js"]);
	});

	test("resolves #imports mapping to another package", async () => {
		writeTraced({
			"node_modules/lib/package.json": {
				name: "lib",
				imports: { "#socket": { workerd: "socket-workerd", default: "socket-node" } },
			},
			"node_modules/lib/index.js": "export * from '#socket';",
			".next/server/route.js": "export * from 'lib/index.js';",
		});
		write({
			"node_modules/socket-workerd/package.json": { name: "socket-workerd" },
			"node_modules/socket-workerd/index.js": "export const socket = 'workerd';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/lib/index.js`,
			"node_modules/socket-workerd/index.js",
		]);
	});

	// esbuild adds the `node` condition on the node platform, it would select `node.js`
	test("resolves the workerd build of a package mapped by #imports", async () => {
		writeTraced({
			"node_modules/lib/package.json": {
				name: "lib",
				imports: { "#socket": { workerd: "socket-impl", default: "./node-socket.js" } },
			},
			"node_modules/lib/index.js": "export * from '#socket';",
			"node_modules/lib/node-socket.js": "export const socket = 'lib';",
			".next/server/route.js": "export * from 'lib/index.js';",
		});
		write({
			"node_modules/socket-impl/package.json": {
				name: "socket-impl",
				exports: { ".": { node: "./node.js", workerd: "./worker.js" } },
			},
			"node_modules/socket-impl/node.js": "export const socket = 'node';",
			"node_modules/socket-impl/worker.js": "export const socket = 'workerd';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/lib/index.js`,
			"node_modules/socket-impl/worker.js",
		]);
	});

	// `resolve.exports` does not validate the targets, esbuild then reports the error
	test.each([
		["exports", "../outside.js"],
		["exports", "./../outside.js"],
		["exports", "./node_modules/outside.js"],
		["imports", "../outside.js"],
	])("does not resolve an %s target outside of the package (%s)", async (field, target) => {
		const pkg =
			field === "exports"
				? { name: "pkg", exports: { ".": { workerd: target, default: "./index.js" } } }
				: { name: "pkg", imports: { "#outside": { workerd: target, default: "./index.js" } } };
		writeTraced({
			"node_modules/pkg/package.json": pkg,
			"node_modules/pkg/index.js": "export const file = 'index';",
			"node_modules/pkg/entry.js": "export * from '#outside';",
			".next/server/route.js": field === "exports" ? "export * from 'pkg';" : "export * from 'pkg/entry.js';",
		});
		write({
			"node_modules/outside.js": "export const file = 'outside';",
			"node_modules/pkg/node_modules/outside.js": "export const file = 'outside';",
		});

		await expect(bundle(".next/server/route.js")).rejects.toThrow(/Could not resolve/);
	});

	// `resolve.exports` throws when the subpath is not exported, esbuild then reports the error
	test("lets esbuild report a subpath that the package does not export", async () => {
		writeTraced({
			"node_modules/pkg/package.json": { name: "pkg", exports: { ".": { workerd: "./w.js" } } },
			"node_modules/pkg/w.js": "export {};",
			".next/server/route.js": "import 'pkg/private.js';",
		});

		await expect(bundle(".next/server/route.js")).rejects.toThrow(/Could not resolve "pkg\/private.js"/);
	});

	test("resolves the workerd build in the pnpm layout", async () => {
		const store = "node_modules/.pnpm";
		writeTraced({
			[`${store}/pg@8.0.0/node_modules/pg/package.json`]: { name: "pg" },
			[`${store}/pg@8.0.0/node_modules/pg/index.js`]: "module.exports = require('pg-cloudflare');",
			[`${store}/pg@8.0.0/node_modules/pg-cloudflare`]:
				"->../../pg-cloudflare@1.0.0/node_modules/pg-cloudflare",
			[`${store}/pg-cloudflare@1.0.0/node_modules/pg-cloudflare/package.json`]: {
				name: "pg-cloudflare",
				exports: { workerd: "./index.js", default: "./empty.js" },
			},
			[`${store}/pg-cloudflare@1.0.0/node_modules/pg-cloudflare/empty.js`]: "module.exports = {};",
			"node_modules/pg": "->.pnpm/pg@8.0.0/node_modules/pg",
			".next/server/route.js": "export * from 'pg';",
		});
		write({
			[`${store}/pg-cloudflare@1.0.0/node_modules/pg-cloudflare/index.js`]:
				"module.exports = require('./socket.js');",
			[`${store}/pg-cloudflare@1.0.0/node_modules/pg-cloudflare/socket.js`]: "module.exports = 'workerd';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/${store}/pg@8.0.0/node_modules/pg/index.js`,
			`${store}/pg-cloudflare@1.0.0/node_modules/pg-cloudflare/index.js`,
			`${store}/pg-cloudflare@1.0.0/node_modules/pg-cloudflare/socket.js`,
		]);
	});

	// The code patches are applied to the traced files, in the output.
	test("prefers the traced copy of a file over the installed one", async () => {
		writeTraced({
			"node_modules/adapter/package.json": { name: "adapter", exports: { workerd: "./workerd.js" } },
			"node_modules/adapter/workerd.js": "export * from 'dep';",
			"node_modules/dep/package.json": { name: "dep" },
			".next/server/route.js": "export * from 'adapter';",
		});
		write({
			"node_modules/dep/index.js": "export const dep = 'installed';",
			[`${OUTPUT}/node_modules/dep/index.js`]: "export const dep = 'patched';",
		});

		const { code } = await bundle(".next/server/route.js");

		expect(code).toContain("patched");
		expect(code).not.toContain("installed");
	});

	test("resolves packages without a workerd condition from the output", async () => {
		writeTraced({
			"node_modules/pkg/package.json": {
				name: "pkg",
				exports: { node: "./node.js", default: "./default.js" },
			},
			"node_modules/pkg/node.js": "export const runtime = 'node';",
			".next/server/route.js": "export * from 'pkg';",
		});
		write({ "node_modules/pkg/default.js": "export const runtime = 'default';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, `${OUTPUT}/node_modules/pkg/node.js`]);
	});

	// The output has the files Next.js traced, the install is not looked up
	test("resolves the imports of packages without a workerd condition in the output", async () => {
		writeTraced({
			"node_modules/pkg/lib.js": "export const file = 'lib';",
			"node_modules/pkg/other.js": "export const file = 'other';",
			".next/server/route.js": "export * from 'pkg';",
		});
		write({
			"node_modules/pkg/package.json": { name: "pkg", main: "./other.js" },
			[`${OUTPUT}/node_modules/pkg/package.json`]: { name: "pkg", main: "./lib.js" },
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, `${OUTPUT}/node_modules/pkg/lib.js`]);
	});

	test("resolves the workerd build of a package hoisted to the root of a monorepo", async () => {
		const appDir = "apps/web";
		// The `node_modules` of the monorepo are copied to the root of the output
		write({
			"node_modules/postgres/package.json": {
				name: "postgres",
				exports: { ".": { default: "./src/index.js", workerd: "./cf/index.js" } },
			},
			"node_modules/postgres/src/index.js": "export const runtime = 'node';",
			"node_modules/postgres/cf/index.js": "export const runtime = 'workerd';",
			[`${appDir}/${OUTPUT}/node_modules/postgres/package.json`]: { name: "postgres" },
			[`${appDir}/${OUTPUT}/node_modules/postgres/src/index.js`]: "export const runtime = 'node';",
		});
		writeTraced({ ".next/server/route.js": "export * from 'postgres';" }, appDir);

		const { inputs } = await bundle(".next/server/route.js", appDir);

		expect(inputs).toEqual([
			`${appDir}/${OUTPUT}/${appDir}/.next/server/route.js`,
			"node_modules/postgres/cf/index.js",
		]);
	});

	// The copy before this plugin failed on string `exports` (#1299)
	test("resolves a package with a string exports from the workerd build", async () => {
		writeTraced({
			"node_modules/adapter/package.json": {
				name: "adapter",
				exports: { ".": { workerd: "./worker.js", default: "./node.js" } },
			},
			"node_modules/adapter/node.js": "export const runtime = 'node';",
			".next/server/route.js": "export * from 'adapter';",
		});
		write({
			"node_modules/adapter/worker.js": "export * from 'dep';",
			"node_modules/dep/package.json": { name: "dep", exports: "./main.js" },
			"node_modules/dep/main.js": "export const runtime = 'workerd';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			"node_modules/adapter/worker.js",
			"node_modules/dep/main.js",
		]);
	});

	// `npm install alias@npm:pkg`: the folder name is not the `name` of the `package.json`
	test("resolves a subpath of the workerd build of an aliased package", async () => {
		writeTraced({
			"node_modules/alias/package.json": {
				name: "pkg",
				exports: { "./sub": { node: "./sub-node.js", workerd: "./sub-worker.js" } },
			},
			"node_modules/alias/sub-node.js": "export const runtime = 'node';",
			".next/server/route.js": "export * from 'alias/sub';",
		});
		write({ "node_modules/alias/sub-worker.js": "export const runtime = 'workerd';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, "node_modules/alias/sub-worker.js"]);
	});

	// Matches @anthropic-ai/sdk@0.39, the copy before this plugin turned the arrays into objects
	test("resolves array targets in a package with a workerd condition", async () => {
		writeTraced({
			"node_modules/sdk/package.json": {
				name: "sdk",
				exports: {
					"./_shims/auto/*": { workerd: "./_shims/auto/*-workerd.mjs", default: "./_shims/auto/*-node.mjs" },
					"./*": { default: ["./*.mjs", "./*/index.mjs"] },
				},
			},
			".next/server/route.js": "export * from 'sdk/client';",
		});
		write({ "node_modules/sdk/client.mjs": "export const client = 'client';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, "node_modules/sdk/client.mjs"]);
	});

	// esbuild adds the `node` condition on the node platform, it would select `node.js`.
	// As Node.js does, an invalid alternative is skipped.
	test.each([
		["an array", ["./worker.js", "./fallback.js"]],
		["an array starting with an invalid target", ["../invalid.js", "./worker.js"]],
	])("prefers the workerd condition listed after node when it is %s", async (_, targets) => {
		writeTraced({
			"node_modules/pkg/package.json": {
				name: "pkg",
				exports: { ".": { node: "./node.js", workerd: targets } },
			},
			"node_modules/pkg/node.js": "export const runtime = 'node';",
			".next/server/route.js": "export * from 'pkg';",
		});
		write({
			"node_modules/invalid.js": "export const runtime = 'invalid';",
			"node_modules/pkg/worker.js": "export const runtime = 'workerd';",
			"node_modules/pkg/fallback.js": "export const runtime = 'fallback';",
		});

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, "node_modules/pkg/worker.js"]);
	});

	// Subpath patterns of `imports`, as used by `@mathjax/src`
	test("resolves a subpath pattern of #imports of the workerd build", async () => {
		writeTraced({
			"node_modules/lib/package.json": {
				name: "lib",
				imports: { "#impl/*": { workerd: "./impl/*.worker.js", default: "./impl/*.node.js" } },
			},
			"node_modules/lib/index.js": "export * from '#impl/socket';",
			"node_modules/lib/impl/socket.node.js": "export const socket = 'node';",
			".next/server/route.js": "export * from 'lib/index.js';",
		});
		write({ "node_modules/lib/impl/socket.worker.js": "export const socket = 'workerd';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/lib/index.js`,
			"node_modules/lib/impl/socket.worker.js",
		]);
	});

	// i.e. `@cf-wasm/photon` (#116): the workerd build imports its `.wasm` with a relative path.
	// `wrangler-external` turns it into an absolute path, wrangler then bundles the `.wasm`.
	test("lets wrangler bundle a .wasm imported by the workerd build", async () => {
		writeTraced({
			"node_modules/photon/package.json": {
				name: "photon",
				exports: { ".": { workerd: "./photon.js", default: "./photon.node.js" } },
			},
			"node_modules/photon/photon.node.js": "export const photon = 'node';",
			".next/server/route.js": "export * from 'photon';",
		});
		write({
			"node_modules/photon/photon.js": "import wasm from './photon.wasm'; export const photon = wasm;",
			"node_modules/photon/photon.wasm": "",
		});

		const { code, inputs } = await bundle(".next/server/route.js", "", [setWranglerExternal()]);

		// The `.wasm` is not traced, it is read from the install
		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`, "node_modules/photon/photon.js"]);
		expect(code).toContain(`"${root}/node_modules/photon/photon.wasm"`);
	});

	// Matches postgres@4.1.0 (#1485): `workerd` is listed after `default`, and the workerd build
	// imports `cloudflare:sockets` statically.
	test("leaves the cloudflare: imports of the workerd build to wrangler", async () => {
		writeTraced({
			"node_modules/postgres/package.json": {
				name: "postgres",
				type: "module",
				exports: { ".": { types: "./types/index.d.ts", default: "./src/index.js", workerd: "./src/cf.js" } },
			},
			"node_modules/postgres/src/index.js": "export default function postgres() { return 'node'; }",
			"node_modules/postgres/src/cf.js":
				"import { connect } from 'cloudflare:sockets'; import postgres from './index.js'; export default function Postgres() { return [postgres(), connect]; }",
			".next/server/route.js": "export { default } from 'postgres';",
		});

		const { code, inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/postgres/src/cf.js`,
			`${OUTPUT}/node_modules/postgres/src/index.js`,
		]);
		expect(code).toMatch(/import \{ connect \} from "cloudflare:sockets"/);
	});

	// The Node.js middleware is traced to its own output (#1487)
	test("resolves the untraced workerd build of a package traced to the middleware output", async () => {
		const output = ".open-next/middleware";
		writeTraced(
			{
				"node_modules/postgres/package.json": {
					name: "postgres",
					type: "module",
					exports: { ".": { default: "./src/index.js", workerd: "./src/cf.js" } },
				},
				"node_modules/postgres/src/index.js": "export default function postgres() { return 'node'; }",
				".next/server/middleware.js": "export { default } from 'postgres';",
			},
			"",
			output
		);
		write({
			"node_modules/postgres/src/cf.js":
				"import { connect } from 'cloudflare:sockets'; export default function Postgres() { return connect; }",
		});

		const { code, inputs } = await bundle(".next/server/middleware.js", "", [], output);

		expect(inputs).toEqual([`${output}/.next/server/middleware.js`, "node_modules/postgres/src/cf.js"]);
		expect(code).toMatch(/import \{ connect \} from "cloudflare:sockets"/);
	});

	// `optional-deps` resolves its dependencies again with a marker, both plugins must not loop
	test("works with the optional dependencies plugin", async () => {
		writeTraced({
			"node_modules/critters/package.json": { name: "critters", main: "./index.js" },
			"node_modules/critters/index.js": "export const critters = 'installed';",
			".next/server/route.js": "export * from 'critters'; export * from 'jimp';",
		});

		const { code, inputs } = await bundle(".next/server/route.js", "", [
			handleOptionalDependencies(["critters", "jimp"]),
		]);

		expect(inputs).toEqual([
			`${OUTPUT}/.next/server/route.js`,
			`${OUTPUT}/node_modules/critters/index.js`,
			"optional-deps-missing-dependency:/jimp",
		]);
		expect(code).toContain('Missing optional dependency "jimp"');
	});

	test("leaves builtins and missing packages to esbuild", async () => {
		writeTraced({ ".next/server/route.js": "import 'node:fs'; import 'events';" });

		const { inputs } = await bundle(".next/server/route.js");

		expect(inputs).toEqual([`${OUTPUT}/.next/server/route.js`]);
		await expect(
			(async () => {
				writeTraced({ ".next/server/missing.js": "import 'missing-package';" });
				await bundle(".next/server/missing.js");
			})()
		).rejects.toThrow(/Could not resolve "missing-package"/);
	});
});

describe("isPackageTarget", () => {
	test.each([
		["./index.js", true],
		["./dist/esm/index.mjs", true],
		["./node_modules_shim/index.js", true],
		["index.js", false],
		["../outside.js", false],
		["./../outside.js", false],
		["./dist/../../outside.js", false],
		["./dist/./index.js", false],
		["./dist//index.js", false],
		["./node_modules/dep/index.js", false],
		["./Node_Modules/dep/index.js", false],
		[String.raw`.\dist\index.js`, false],
		[String.raw`./dist\..\..\outside.js`, false],
	])("%s", (target, valid) => {
		expect(isPackageTarget(target)).toBe(valid);
	});
});

describe("packageName", () => {
	test.each([
		["pkg", "pkg"],
		["pkg/sub/path.js", "pkg"],
		["@scope/pkg", "@scope/pkg"],
		["@scope/pkg/sub", "@scope/pkg"],
	])("%s", (specifier, name) => {
		expect(packageName(specifier)).toBe(name);
	});
});

describe("keepCondition", () => {
	test("top level", () => {
		const exports = {
			workerd: "./path/to/workerd.js",
			default: "./path/to/default.js",
		};

		expect(keepCondition(exports, "workerd")).toEqual({ workerd: "./path/to/workerd.js" });
		expect(keepCondition(exports, "default")).toEqual({ default: "./path/to/default.js" });
		expect(keepCondition(exports, "module")).toBeUndefined();
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

		expect(keepCondition(exports, "workerd")).toEqual({
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
				},
				default: "./server.js",
			},
		});
		expect(keepCondition(exports, "default")).toEqual({
			".": "/path/to/index.js",
			"./server": {
				default: "./server.js",
			},
		});
		expect(keepCondition(exports, "module")).toBeUndefined();
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

		expect(keepCondition(exports, "workerd")).toEqual(exports);
	});

	// i.e. @anthropic-ai/sdk@0.39: `"./*": { "default": ["./*.mjs", "./*/index.mjs"] }`
	test("arrays of targets", () => {
		const exports = {
			".": { node: "./node.js", workerd: ["./worker.mjs", "./worker.js"] },
			"./*": { default: ["./*.mjs", "./*/index.mjs"] },
			"./sub": [{ workerd: "./sub-worker.js", default: "./sub.js" }, "./sub-fallback.js"],
		};

		expect(keepCondition(exports, "workerd")).toEqual({
			".": { workerd: ["./worker.mjs", "./worker.js"] },
			"./*": { default: ["./*.mjs", "./*/index.mjs"] },
			"./sub": [{ workerd: "./sub-worker.js" }, "./sub-fallback.js"],
		});
	});

	test("preserve sibling subtree that nests the condition", () => {
		const exports = {
			"react-server": {
				workerd: "./rsc.edge.js",
			},
			workerd: "./top.edge.js",
		};

		expect(keepCondition(exports, "workerd")).toEqual(exports);
	});

	test("shares the subtrees without the condition", () => {
		const exports = {
			".": { node: "./node.js", default: ["./index.mjs", "./index.js"] },
			"./sub": { node: "./sub-node.js", workerd: "./sub-worker.js" },
		};

		const transformed = keepCondition(exports, "workerd");

		expect(transformed).toEqual({ ".": exports["."], "./sub": { workerd: "./sub-worker.js" } });
		expect(transformed?.["."]).toBe(exports["."]);
	});

	test.each([["./index.js"], [["./index.js"]], [null], [undefined]])("not a map: %j", (map) => {
		expect(keepCondition(map, "workerd")).toBeUndefined();
	});
});
