import { setImmediate as nativeSetImmediate } from "node:timers";

import { afterAll, expect, it } from "vitest";

const NEXT_ORIGINALS = Symbol.for("next.fast-set-immediate.originals");
const globals = globalThis as Record<symbol, { setImmediate: typeof setImmediate } | undefined>;

afterAll(() => {
	delete globals[NEXT_ORIGINALS];
	globalThis.setImmediate = nativeSetImmediate;
});

it("counts the immediates when Next.js recorded the native `setImmediate` before the scheduler loaded", async () => {
	globals[NEXT_ORIGINALS] = { setImmediate: nativeSetImmediate };

	const { runInSequentialTasks } = await import("./cache-components-scheduler.js");

	const original = globals[NEXT_ORIGINALS].setImmediate;
	globalThis.setImmediate = ((callback: () => void) => original(callback)) as typeof setImmediate;

	const log: string[] = [];
	const gate = Promise.withResolvers<void>();
	void gate.promise.then(() =>
		setImmediate(() => {
			log.push("work");
			setImmediate(() => log.push("flush"));
		})
	);

	await runInSequentialTasks(
		() => {
			log.push("stage 0");
			gate.resolve();
		},
		() => log.push("stage 1")
	);

	expect(log).toEqual(["stage 0", "work", "flush", "stage 1"]);
});
