import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { parseSpecifier, resolvePackages } from "./resolve-packages.js";

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
	 */
	function writeTraced(files: Record<string, string | object>, appDir = "") {
		write(
			Object.fromEntries(Object.entries(files).map(([file, content]) => [path.join(appDir, file), content]))
		);
		write(
			Object.fromEntries(
				Object.entries(files).map(([file, content]) => [path.join(appDir, OUTPUT, appDir, file), content])
			)
		);
	}

	/**
	 * Bundles an entry point of the output with the `workerd` condition, as `bundleServer` does.
	 *
	 * @returns The bundled code and the bundled files, relative to the root
	 */
	async function bundle(entry: string, appDir = "") {
		const appPath = path.join(root, appDir);
		const result = await build({
			entryPoints: [path.join(appPath, OUTPUT, appDir, entry)],
			absWorkingDir: root,
			bundle: true,
			write: false,
			metafile: true,
			format: "esm",
			platform: "node",
			conditions: ["workerd"],
			logLevel: "silent",
			plugins: [
				resolvePackages({
					outputDir: path.join(appPath, ".open-next"),
					appBuildOutputPath: appPath,
					monorepoRoot: root,
				}),
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

describe("parseSpecifier", () => {
	test.each([
		["pkg", "pkg", "."],
		["pkg/sub/path.js", "pkg", "./sub/path.js"],
		["@scope/pkg", "@scope/pkg", "."],
		["@scope/pkg/sub", "@scope/pkg", "./sub"],
	])("%s", (specifier, name, subpath) => {
		expect(parseSpecifier(specifier)).toEqual({ name, subpath });
	});
});
