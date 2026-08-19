import { afterAll, describe, expect, it } from "vitest";

import { runInSequentialTasks } from "./cache-components-scheduler.js";

const nativeSetImmediate = globalThis.setImmediate;
const nativeClearImmediate = globalThis.clearImmediate;

afterAll(() => {
	globalThis.setImmediate = nativeSetImmediate;
	globalThis.clearImmediate = nativeClearImmediate;
});

/**
 * Stands in for React Flight: a stage unblocks a gate, the component resumes across `hops` microtask
 * hops, and only then schedules the flush through `setImmediate`. Next's contract is that both the
 * work and its flush land before the next stage runs.
 */
function createGatedRender(stages: number, hops: number, log: string[]) {
	const gates = Array.from({ length: stages }, () => {
		let open!: () => void;
		const opened = new Promise<void>((resolve) => (open = resolve));
		return { opened, open };
	});

	return {
		start() {
			for (const [stage, gate] of gates.entries()) {
				void gate.opened.then(async () => {
					for (let hop = 0; hop < hops; hop++) await null;
					setImmediate(() => {
						log.push(`work${stage}`);
						setImmediate(() => log.push(`flush${stage}`));
					});
				});
			}
		},
		advance: (stage: number) => gates[stage]!.open(),
	};
}

function runGatedRender(stages: number, hops: number, log: string[]) {
	const render = createGatedRender(stages, hops, log);
	return runInSequentialTasks(
		() => {
			render.start();
			return "rendered";
		},
		...Array.from({ length: stages }, (_, stage) => () => {
			log.push(`stage${stage}`);
			render.advance(stage);
		})
	);
}

describe("runInSequentialTasks", () => {
	it("resolves with what the first task returned", async () => {
		const order: string[] = [];
		const result = await runInSequentialTasks(
			() => {
				order.push("first");
				return 42;
			},
			() => order.push("second"),
			() => order.push("third")
		);

		expect(result).toEqual(42);
		expect(order).toEqual(["first", "second", "third"]);
	});

	it("adopts a promise returned by the first task", async () => {
		await expect(
			runInSequentialTasks(
				async () => "async result",
				() => {}
			)
		).resolves.toEqual("async result");
	});

	// The regression: on workerd the render's flush used to slip behind the stage that unblocked it,
	// so a runtime prefetch aborted before the content it had already rendered was collected.
	it.each([0, 1, 3, 12])(
		"flushes each stage's work before the next stage, %i microtask hops in",
		async (hops) => {
			const log: string[] = [];

			await runGatedRender(4, hops, log);

			expect(log).toEqual([
				"stage0",
				"work0",
				"flush0",
				"stage1",
				"work1",
				"flush1",
				"stage2",
				"work2",
				"flush2",
				"stage3",
				"work3",
				"flush3",
			]);
		}
	);

	it("keeps overlapping renders from gating each other", async () => {
		const slowLog: string[] = [];
		const fastLog: string[] = [];

		// The slow render keeps scheduling immediates long after the fast one is done, which must not
		// hold the fast render's stages back.
		await Promise.all([runGatedRender(4, 12, slowLog), runGatedRender(4, 0, fastLog)]);

		for (const log of [slowLog, fastLog]) {
			expect(log).toEqual([
				"stage0",
				"work0",
				"flush0",
				"stage1",
				"work1",
				"flush1",
				"stage2",
				"work2",
				"flush2",
				"stage3",
				"work3",
				"flush3",
			]);
		}
	});

	it("rejects and skips the remaining tasks when a task throws", async () => {
		const order: string[] = [];
		const failure = new Error("stage failed");

		await expect(
			runInSequentialTasks(
				() => order.push("first"),
				() => {
					throw failure;
				},
				() => order.push("never")
			)
		).rejects.toBe(failure);

		expect(order).toEqual(["first"]);
	});

	it("does not wait on an immediate that was cleared", async () => {
		const log: string[] = [];

		await runInSequentialTasks(
			() => {
				const immediate = setImmediate(() => log.push("cleared"));
				clearImmediate(immediate);
			},
			() => log.push("stage1")
		);

		expect(log).toEqual(["stage1"]);
	});
});
