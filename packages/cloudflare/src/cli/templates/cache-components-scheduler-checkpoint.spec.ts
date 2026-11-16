import { clearImmediate as nativeClearImmediate, setImmediate as nativeSetImmediate } from "node:timers";

import { afterAll, beforeEach, expect, it } from "vitest";

// workerd dispatches `unhandledrejection` when the microtask queue is empty, before the task ends,
// and `init.ts` reports it to the scheduler. A tick that a microtask schedules runs at the same point
// on Node.js, so it stands in for the event.

const CHECKPOINT = Symbol.for("__opennext-microtask-checkpoint__");
const globals = globalThis as { [CHECKPOINT]?: { onCheckpoint?: () => void } };

const nativeNextTick = process.nextTick;
const nativeReject = Promise.reject.bind(Promise);

const hub: { onCheckpoint?: () => void } = {};
globals[CHECKPOINT] = hub;
let checkpoints = 0;
let dispatches = true;

Promise.reject = ((reason?: unknown) => {
	if (reason !== CHECKPOINT) return nativeReject(reason);

	checkpoints++;
	if (dispatches) queueMicrotask(() => nativeNextTick(() => hub.onCheckpoint?.()));
	return Promise.resolve();
}) as typeof Promise.reject;

const { runInSequentialTasks } = await import("./cache-components-scheduler.js");
const capturingNextTick = process.nextTick;

beforeEach(() => {
	checkpoints = 0;
	// Vitest puts the native `process.nextTick` back before each test.
	process.nextTick = capturingNextTick;
});

afterAll(() => {
	Promise.reject = nativeReject;
	delete globals[CHECKPOINT];
	globalThis.setImmediate = nativeSetImmediate;
	globalThis.clearImmediate = nativeClearImmediate;
});

async function awaitTimes(count: number) {
	for (let i = 0; i < count; i++) await null;
}

it("ends a stage once a chain of 50000 promise reactions is done", async () => {
	const log: string[] = [];

	await runInSequentialTasks(
		() => {
			void awaitTimes(50_000).then(() => {
				log.push("cached data");
				setImmediate(() => log.push("flush"));
			});
		},
		() => log.push("stage 1")
	);

	expect(log).toEqual(["cached data", "flush", "stage 1"]);
});

it("runs a tick that a promise reaction scheduled after an input that is 50000 awaits deep", async () => {
	const log: string[] = [];

	await runInSequentialTasks(
		() => {
			void Promise.resolve().then(() => process.nextTick(() => log.push("abort")));
			void awaitTimes(50_000).then(() => log.push("input"));
		},
		() => log.push("stage 1")
	);

	expect(log).toEqual(["input", "abort", "stage 1"]);
});

it("runs an immediate once the promise reactions of the previous one are done", async () => {
	const log: string[] = [];

	await runInSequentialTasks(
		() => {
			setImmediate(() => void awaitTimes(5000).then(() => log.push("reactions of the first")));
			setImmediate(() => log.push("second"));
		},
		() => log.push("stage 1")
	);

	expect(log).toEqual(["reactions of the first", "second", "stage 1"]);
});

// workerd runs 64 extra checkpoints per task. Past them it would cancel the request as hung.
it("stays within the checkpoints that workerd runs in a task, and still runs every stage", async () => {
	const log: string[] = [];
	const rounds = 500;

	await runInSequentialTasks(
		() => {
			// Each round ends with a tick that a promise reaction scheduled, which takes a checkpoint.
			let round = 0;
			const next = () => {
				if (++round > rounds) return void log.push(`${rounds} rounds`);
				void awaitTimes(3).then(() => process.nextTick(next));
			};
			next();
		},
		() => log.push("stage 1"),
		() => log.push("stage 2")
	);

	expect(log).toEqual([`${rounds} rounds`, "stage 1", "stage 2"]);
	expect(checkpoints).toBeGreaterThan(0);
	expect(checkpoints).toBeLessThanOrEqual(56);
});

it("gives every render the whole checkpoint budget", async () => {
	for (let render = 0; render < 3; render++) {
		checkpoints = 0;
		const log: string[] = [];

		await runInSequentialTasks(
			() => {
				void awaitTimes(50_000).then(() => log.push("cached data"));
			},
			() => log.push("stage 1")
		);

		expect(log).toEqual(["cached data", "stage 1"]);
		expect(checkpoints).toBeGreaterThan(0);
	}
});

// workerd stops dispatching the event once a listener of the app rejects a promise during a dispatch.
// This test is the last one: the scheduler does not rely on the event afterwards.
it("fails the render when the event is not dispatched, and runs the next ones without it", async () => {
	const log: string[] = [];
	dispatches = false;

	await expect(
		runInSequentialTasks(
			() => log.push("stage 0"),
			() => log.push("stage 1")
		)
	).rejects.toThrow("workerd did not dispatch the `unhandledrejection` event");

	checkpoints = 0;
	await runInSequentialTasks(
		() => {
			setImmediate(() => log.push("flush"));
		},
		() => log.push("next render")
	);

	expect(log).toEqual(["stage 0", "flush", "next render"]);
	expect(checkpoints).toEqual(0);
});
