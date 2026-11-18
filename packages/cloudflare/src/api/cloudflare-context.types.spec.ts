import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const declarations = path.join(packageRoot, "dist/api");
const modules = path.join(packageRoot, "node_modules");
const require = createRequire(import.meta.url);
const wrangler = path.resolve(require.resolve("wrangler/package.json"), "../bin/wrangler.js");

function checkBindings(assertions: string, envInterface?: string) {
	const dir = mkdtempSync(path.join(tmpdir(), "opennext-bindings-"));
	try {
		const consumer = path.join(dir, "consumer.ts");
		writeFileSync(
			consumer,
			`import { getCloudflareContext } from "@opennextjs/cloudflare";
declare const direct: CloudflareEnv;
const { env } = getCloudflareContext();
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
${assertions}`
		);
		const files = [consumer];
		if (envInterface) {
			mkdirSync(path.join(dir, "public"));
			writeFileSync(
				path.join(dir, "worker.ts"),
				'export { DOQueueHandler } from "@opennextjs/cloudflare/durable-objects/queue";'
			);
			writeFileSync(
				path.join(dir, "wrangler.json"),
				JSON.stringify({
					name: "opennext-binding-types",
					main: "./worker.ts",
					compatibility_date: "2026-10-01",
					compatibility_flags: ["nodejs_compat"],
					assets: { directory: "./public", binding: "ASSETS" },
					r2_buckets: [{ binding: "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "fixture" }],
					vars: { NEXTJS_ENV: "production", APP_ONLY: "custom" },
					durable_objects: {
						bindings: [{ name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" }],
					},
					migrations: [{ tag: "v1", new_sqlite_classes: ["DOQueueHandler"] }],
				})
			);
			execFileSync(
				process.execPath,
				[wrangler, "types", "--env-interface", envInterface, "--include-runtime=false"],
				{
					cwd: dir,
					env: {
						...process.env,
						WRANGLER_SEND_METRICS: "false",
						WRANGLER_LOG_PATH: path.join(dir, "wrangler.log"),
					},
				}
			);
			files.push(path.join(dir, "worker-configuration.d.ts"));
		}

		const program = ts.createProgram(files, {
			noEmit: true,
			strict: true,
			skipLibCheck: false,
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			lib: ["lib.esnext.d.ts"],
			types: ["@cloudflare/workers-types", "node"],
			typeRoots: [modules, path.join(modules, "@types")],
			paths: {
				"@opennextjs/cloudflare": [path.join(declarations, "index.d.ts")],
				"@opennextjs/cloudflare/*": [path.join(declarations, "*.d.ts")],
			},
		});
		// The Workers and Node global libraries also overlap. Check the consumer, generated bindings,
		// and published context declaration, where diagnostics from this integration surface.
		const checkedFiles = new Set(
			[...files, path.join(declarations, "cloudflare-context.d.ts")].map((file) => path.normalize(file))
		);
		const diagnostics = ts
			.getPreEmitDiagnostics(program)
			.filter(({ file }) => !file || checkedFiles.has(path.normalize(file.fileName)))
			.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n"));
		expect(diagnostics).toEqual([]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("CloudflareEnv declarations", () => {
	test("prefer types generated for CloudflareEnv and retain unconfigured fallbacks", () => {
		checkBindings(
			`type Generated = [
	Assert<Equal<typeof env.ASSETS, Fetcher>>,
	Assert<Equal<typeof direct.ASSETS, Fetcher>>,
	Assert<Equal<typeof env.NEXT_INC_CACHE_R2_BUCKET, R2Bucket>>,
	Assert<Equal<typeof env.NEXTJS_ENV, "production">>,
	Assert<Equal<typeof env.APP_ONLY, "custom">>,
	Assert<Equal<typeof env.NEXT_CACHE_DO_QUEUE, DurableObjectNamespace<import("./worker").DOQueueHandler>>>,
	Assert<Equal<typeof env.NEXT_INC_CACHE_KV, KVNamespace | undefined>>
];`,
			"CloudflareEnv"
		);
	});

	test.each([
		["without type generation", undefined],
		["with a different generated environment", "OtherWorkerEnv"],
	])("retain app augmentations and fallbacks %s", (_, envInterface) => {
		checkBindings(
			`declare global { interface CloudflareEnv { MANUAL: "local"; } }
type Fallbacks = [
	Assert<Equal<typeof env.MANUAL, "local">>,
	Assert<Equal<typeof direct.ASSETS, Fetcher | undefined>>,
	Assert<Equal<typeof env.NEXT_INC_CACHE_R2_BUCKET, R2Bucket | undefined>>,
	Assert<Equal<Extract<keyof CloudflareEnv, "APP_ONLY">, never>>
];`,
			envInterface
		);
	});
});
