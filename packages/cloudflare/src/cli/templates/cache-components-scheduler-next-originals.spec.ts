import { clearImmediate as nativeClearImmediate, setImmediate as nativeSetImmediate } from "node:timers";

import { afterAll, expect, it } from "vitest";

type NextOriginals = {
	setImmediate: typeof setImmediate;
	clearImmediate: typeof clearImmediate;
	nextTick: typeof process.nextTick;
};

const NEXT_ORIGINALS = Symbol.for("next.fast-set-immediate.originals");
const globals = globalThis as Record<symbol, NextOriginals | undefined>;
const nativeNextTick = process.nextTick;

afterAll(() => {
	delete globals[NEXT_ORIGINALS];
	globalThis.setImmediate = nativeSetImmediate;
	globalThis.clearImmediate = nativeClearImmediate;
});

it("runs the immediates and the ticks of a stage when Next.js recorded the native functions before the scheduler loaded", async () => {
	globals[NEXT_ORIGINALS] = {
		setImmediate: nativeSetImmediate,
		clearImmediate: nativeClearImmediate,
		nextTick: nativeNextTick,
	};

	const { runInSequentialTasks } = await import("./cache-components-scheduler.js");

	// Next.js installs functions that call the recorded ones.
	const originals = globals[NEXT_ORIGINALS];
	globalThis.setImmediate = ((...args: Parameters<typeof setImmediate>) =>
		originals.setImmediate(...args)) as typeof setImmediate;
	globalThis.clearImmediate = ((immediate) => originals.clearImmediate(immediate)) as typeof clearImmediate;
	process.nextTick = (...args: Parameters<typeof process.nextTick>) => originals.nextTick(...args);

	const log: string[] = [];
	const gate = Promise.withResolvers<void>();
	void gate.promise.then(() =>
		setImmediate(() => {
			log.push("work");
			clearImmediate(setImmediate(() => log.push("cleared")));
			setImmediate(() => log.push("flush"));
			void Promise.resolve().then(() => process.nextTick(() => log.push("tick")));
			void Promise.resolve()
				.then(() => {})
				.then(() => log.push("reactions"));
		})
	);

	try {
		await runInSequentialTasks(
			() => {
				log.push("stage 0");
				gate.resolve();
			},
			() => log.push("stage 1")
		);
	} finally {
		process.nextTick = nativeNextTick;
	}

	expect(log).toEqual(["stage 0", "work", "reactions", "tick", "flush", "stage 1"]);
});
