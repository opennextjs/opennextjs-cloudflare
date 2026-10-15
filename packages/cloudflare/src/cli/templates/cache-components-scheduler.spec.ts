import { AsyncLocalStorage } from "node:async_hooks";
import { clearImmediate as nativeClearImmediate, setImmediate as nativeSetImmediate } from "node:timers";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import { runInSequentialTasks } from "./cache-components-scheduler.js";

const requestContextStorage = new AsyncLocalStorage<object>();
Object.defineProperty(globalThis, Symbol.for("__cloudflare-context__"), {
	get: () => requestContextStorage.getStore(),
	configurable: true,
});
const inRequest = <T>(run: () => T): T => requestContextStorage.run({}, run);

const countedSetImmediate = globalThis.setImmediate;
afterAll(() => {
	globalThis.setImmediate = nativeSetImmediate;
});

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

	// Next.js awaits the RSC payload before it stages the render.
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

	it("waits for an immediate scheduled through the promise API", async () => {
		const log: string[] = [];
		const setImmediatePromise = (
			globalThis.setImmediate as unknown as { [promisify.custom]: (value: string) => Promise<string> }
		)[promisify.custom];

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					void Promise.resolve().then(() => setImmediatePromise("flush").then((value) => log.push(value)));
				},
				() => log.push("stage 1")
			)
		);

		expect(log).toEqual(["flush", "stage 1"]);
	});

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
