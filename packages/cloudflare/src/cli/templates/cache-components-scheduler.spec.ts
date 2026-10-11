import { AsyncLocalStorage } from "node:async_hooks";
import { clearImmediate as nativeClearImmediate, setImmediate as nativeSetImmediate } from "node:timers";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import { runInSequentialTasks } from "./cache-components-scheduler.js";

/** Mirrors `init.ts`: the request context is an ALS store that a global symbol exposes. */
const requestContextStorage = new AsyncLocalStorage<object>();
Object.defineProperty(globalThis, Symbol.for("__cloudflare-context__"), {
	get: () => requestContextStorage.getStore(),
	configurable: true,
});
const inRequest = <T>(run: () => T): T => requestContextStorage.run({}, run);

// The scheduler replaced the global function when it was imported.
const countedSetImmediate = globalThis.setImmediate;
afterAll(() => {
	globalThis.setImmediate = nativeSetImmediate;
});

/**
 * Stands for a React render. A stage opens a gate, the component resumes `awaits` microtasks later,
 * then schedules its work, and the work schedules its flush. Both must run before the next stage.
 */
function runGatedRender(stageCount: number, awaits: number, log: string[]) {
	const gates = Array.from({ length: stageCount }, () => Promise.withResolvers<void>());

	return runInSequentialTasks(
		() => {
			for (const [stage, gate] of gates.entries()) {
				void gate.promise.then(async () => {
					for (let i = 0; i < awaits; i++) await null;
					setImmediate(() => {
						log.push(`work ${stage}`);
						setImmediate(() => log.push(`flush ${stage}`));
					});
				});
			}
			return "rendered";
		},
		...gates.map((gate, stage) => () => {
			log.push(`stage ${stage}`);
			gate.resolve();
		})
	);
}

describe("runInSequentialTasks", () => {
	it("runs the stages in order and resolves with the result of the first one", async () => {
		const log: string[] = [];

		const result = await inRequest(() =>
			runInSequentialTasks(
				() => {
					log.push("first");
					return 42;
				},
				() => log.push("second"),
				() => log.push("third")
			)
		);

		expect(result).toEqual(42);
		expect(log).toEqual(["first", "second", "third"]);
	});

	// The regression. On workerd the flush of a stage ran after the next stage, so a runtime prefetch
	// stopped before it collected content that was already rendered.
	it.each([0, 1, 12])(
		"runs the work and the flush of a stage before the next stage, %i awaits in",
		async (awaits) => {
			const log: string[] = [];

			await expect(inRequest(() => runGatedRender(3, awaits, log))).resolves.toEqual("rendered");

			expect(log).toEqual([
				"stage 0",
				"work 0",
				"flush 0",
				"stage 1",
				"work 1",
				"flush 1",
				"stage 2",
				"work 2",
				"flush 2",
			]);
		}
	);

	// Next.js awaits the RSC payload before it stages the render, so React resumes from promises that
	// were created outside the staged run.
	it("waits for work that resumes from a promise created before the render", async () => {
		const log: string[] = [];

		await inRequest(async () => {
			const gate = Promise.withResolvers<void>();
			void gate.promise.then(() => setImmediate(() => log.push("flush")));

			await runInSequentialTasks(
				() => {
					log.push("stage 0");
					gate.resolve();
				},
				() => log.push("stage 1")
			);
		});

		expect(log).toEqual(["stage 0", "flush", "stage 1"]);
	});

	// Next.js reads this hook to build its `node:timers/promises` `setImmediate`. workerd does not
	// define it on the global function.
	it("waits for an immediate scheduled through the promise API", async () => {
		const log: string[] = [];
		const setImmediatePromise = (
			globalThis.setImmediate as unknown as { [promisify.custom]: (value: string) => Promise<string> }
		)[promisify.custom];

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					// React schedules its work from a microtask, after the stage returns.
					void Promise.resolve().then(() => setImmediatePromise("flush").then((value) => log.push(value)));
				},
				() => log.push("stage 1")
			)
		);

		expect(log).toEqual(["flush", "stage 1"]);
	});

	// Only the first way goes through the global `clearImmediate`. A stage that waits for an immediate
	// that was cancelled never ends, and the request cannot render again.
	it.each([
		["the global `clearImmediate`", (immediate: NodeJS.Immediate) => clearImmediate(immediate)],
		["`clearImmediate` from `node:timers`", (immediate: NodeJS.Immediate) => nativeClearImmediate(immediate)],
		["`Symbol.dispose`", (immediate: NodeJS.Immediate) => immediate[Symbol.dispose]()],
	])("does not wait for an immediate that %s cancelled", async (_, cancel) => {
		const log: string[] = [];

		await inRequest(async () => {
			await runInSequentialTasks(
				() => {
					void Promise.resolve().then(() => cancel(setImmediate(() => log.push("cancelled"))));
				},
				() => log.push("stage 1")
			);
			await runInSequentialTasks(() => log.push("next render"));
		});

		expect(log).toEqual(["stage 1", "next render"]);
	});

	it("does not interleave the stages of two renders of one request", async () => {
		const log: string[] = [];

		await inRequest(() =>
			Promise.all([
				runInSequentialTasks(
					() => log.push("a0"),
					() => log.push("a1")
				),
				runInSequentialTasks(
					() => log.push("b0"),
					() => log.push("b1")
				),
			])
		);

		expect(log).toEqual(["a0", "a1", "b0", "b1"]);
	});

	it("does not wait for the immediates of another request", async () => {
		let otherRequestIsActive = true;
		const keepScheduling = () => {
			if (otherRequestIsActive) setImmediate(keepScheduling);
		};
		inRequest(keepScheduling);

		try {
			await expect(
				inRequest(() =>
					runInSequentialTasks(
						() => "rendered",
						() => {}
					)
				)
			).resolves.toEqual("rendered");
		} finally {
			otherRequestIsActive = false;
		}
	});

	// Next.js 16.4 installs a `setImmediate` that schedules a sentinel immediate on every call, to find
	// when a render is idle. The stage hops must not go through it, or the sentinel never ends.
	it("settles when a `setImmediate` installed later schedules an immediate on every call", async () => {
		const log: string[] = [];
		let sentinel: NodeJS.Immediate | null = null;
		let checkAgain = false;
		const scheduleIdleCheck = () => {
			if (sentinel) {
				checkAgain = true;
				return;
			}
			sentinel = countedSetImmediate(() => {
				sentinel = null;
				if (checkAgain) {
					checkAgain = false;
					scheduleIdleCheck();
				}
			});
		};
		globalThis.setImmediate = ((callback: () => void) => {
			const immediate = countedSetImmediate(callback);
			scheduleIdleCheck();
			return immediate;
		}) as typeof setImmediate;

		try {
			await inRequest(() =>
				runInSequentialTasks(
					() => {
						setImmediate(() => log.push("flush"));
					},
					() => log.push("stage 1")
				)
			);
		} finally {
			globalThis.setImmediate = countedSetImmediate;
		}

		expect(log).toEqual(["flush", "stage 1"]);
	});

	it("rejects and skips the next stages when a stage throws, then runs the next render", async () => {
		const log: string[] = [];

		await inRequest(async () => {
			await expect(
				runInSequentialTasks(
					() => log.push("first"),
					() => {
						throw new Error("stage failed");
					},
					() => log.push("skipped")
				)
			).rejects.toThrow("stage failed");

			await runInSequentialTasks(() => log.push("next render"));
		});

		expect(log).toEqual(["first", "next render"]);
	});

	// A hung request has no error. A render that cannot settle must fail with one.
	it("rejects when the immediates of the request never end", async () => {
		let active = true;
		const keepScheduling = () => {
			if (active) setImmediate(keepScheduling);
		};

		try {
			await expect(
				inRequest(() =>
					runInSequentialTasks(
						() => keepScheduling(),
						() => {}
					)
				)
			).rejects.toThrow(/did not settle: the request still schedules immediates after 1000 tasks/);
		} finally {
			active = false;
		}
	});
});
