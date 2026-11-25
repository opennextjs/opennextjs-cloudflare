import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import { createTestHarness } from "wrangler";

let directory: string;

beforeAll(async () => {
	directory = await mkdtemp(path.join(tmpdir(), "open-next-cache-components-"));

	await Promise.all([
		writeFile(path.join(directory, "next-env.mjs"), "export {};\n"),
		build({
			entryPoints: [
				fileURLToPath(new URL("./test-fixtures/cache-components-scheduler-worker.mjs", import.meta.url)),
			],
			outfile: path.join(directory, "worker.mjs"),
			bundle: true,
			platform: "node",
			format: "esm",
			external: ["./next-env.mjs"],
			define: {
				__CACHE_COMPONENTS_SCHEDULER__: "true",
				__BUILD_TIMESTAMP_MS__: "0",
				__NEXT_BASE_PATH__: '""',
				__ASSETS_RUN_WORKER_FIRST__: "false",
				__DEPLOYMENT_ID__: '""',
				__TRAILING_SLASH__: "false",
			},
		}),
	]);
});

afterAll(async () => {
	if (directory) await rm(directory, { recursive: true, force: true });
});

async function startWorker(compatibilityFlags: string[] = []) {
	const harness = createTestHarness({
		root: directory,
		workers: [
			{
				config: {
					name: "cache-components-scheduler-test",
					main: "worker.mjs",
					compatibility_date: "2026-08-01",
					compatibility_flags: ["nodejs_compat", ...compatibilityFlags],
				},
			},
		],
	});
	onTestFinished(() => harness.close());
	await harness.listen();
	return async (scenario: string, signal?: AbortSignal): Promise<unknown> => {
		const response = await harness.fetch(scenario, { signal });
		const body = await response.text();
		expect(response.status, body).toBe(200);
		return JSON.parse(body);
	};
}

it("drains each stage before native timers and starts each render with fresh checkpoints", async () => {
	const run = await startWorker();

	const order = [
		"first",
		"first promises",
		"first tick",
		"first immediate",
		"second",
		"second promises",
		"second tick",
		"second immediate",
		"last",
		"timer",
	];
	// A Worker request uses more checkpoints across these renders than one workerd task can use.
	expect(await run("/repeated-stage-order")).toEqual(Array.from({ length: 24 }, () => order));
});

it("drains promise reactions from an immediate before running the next immediate", async () => {
	const run = await startWorker();

	expect(await run("/immediate-order")).toEqual([
		"first immediate",
		"first promises",
		"second immediate",
		"next stage",
	]);
});

it("skips immediates cancelled through the global function or Symbol.dispose", async () => {
	const run = await startWorker();

	expect(await run("/cancelled-immediates")).toEqual(["kept", "next stage", "timer"]);
});

it("keeps stages in one task with the checkpoint compatibility flag disabled", async () => {
	const run = await startWorker(["no_unhandled_rejection_after_microtask_checkpoint"]);

	expect(await run("/bounded")).toEqual(["ticks done", "next stage", "promises done", "timer"]);
});

it("keeps stages in one task when a render uses up the checkpoint budget", async () => {
	const run = await startWorker();

	// The render has more tick waves than workerd can give it in checkpoints.
	expect(await run("/exhausted")).toEqual(["ticks done", "next stage", "promises done", "timer"]);
});

it(
	"rejects a render that loses its checkpoint and settles other queued renders",
	{ timeout: 15_000 },
	async () => {
		const run = await startWorker();
		const missingCheckpoint = "workerd did not dispatch the `unhandledrejection` event";

		await run("/stage-order");
		expect(await run("/nested-rejections", AbortSignal.timeout(10_000))).toEqual({
			rejections: ["application rejection", "nested rejection"],
			renders: [expect.stringContaining(missingCheckpoint), "second result"],
		});
		expect(await run("/bounded")).toEqual(["ticks done", "next stage", "promises done", "timer"]);
	}
);
