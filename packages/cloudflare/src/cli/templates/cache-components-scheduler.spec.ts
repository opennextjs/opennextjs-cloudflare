import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { clearImmediate as nativeClearImmediate, setImmediate as nativeSetImmediate } from "node:timers";
import { promisify } from "node:util";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runInSequentialTasks } from "./cache-components-scheduler.js";

// Node.js has no `unhandledrejection` event, so these tests run without the microtask checkpoint of
// workerd: the runner ends a stage after 1024 microtasks that schedule nothing.

const requestContextStorage = new AsyncLocalStorage<object>();
Object.defineProperty(globalThis, Symbol.for("__cloudflare-context__"), {
	get: () => requestContextStorage.getStore(),
	configurable: true,
});
const inRequest = <T>(run: () => T): T => requestContextStorage.run({}, run);

const capturingSetImmediate = globalThis.setImmediate;
const capturingNextTick = process.nextTick;
// Vitest puts the native `process.nextTick` back before each test.
beforeEach(() => {
	process.nextTick = capturingNextTick;
});
afterAll(() => {
	globalThis.setImmediate = nativeSetImmediate;
	globalThis.clearImmediate = nativeClearImmediate;
});

const nextTask = () => new Promise<void>((resolve) => nativeSetImmediate(resolve));

async function awaitTimes(count: number) {
	for (let i = 0; i < count; i++) await null;
}

function burn(milliseconds: number) {
	const end = performance.now() + milliseconds;
	while (performance.now() < end);
}

function runGatedRender(stageCount: number, awaits: number, log: string[]) {
	const gates = Array.from({ length: stageCount }, () => Promise.withResolvers<void>());

	return runInSequentialTasks(
		() => {
			for (const [stage, gate] of gates.entries()) {
				void gate.promise.then(async () => {
					await awaitTimes(awaits);
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

	it.each([0, 1, 12, 500])(
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

	// Next.js treats what resolves after the last stage as uncached data.
	it("runs no timer and no I/O callback before the last stage has settled", async () => {
		const log: string[] = [];
		let pending: Promise<unknown>;

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					pending = Promise.all([
						new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => log.push("timer")),
						readFile(import.meta.filename).then(() => log.push("file")),
					]);
					// The render works for longer than the timer and the read take.
					let chunks = 20;
					const work = () => {
						burn(2);
						if (--chunks > 0) setImmediate(work);
						else log.push("rendered");
					};
					setImmediate(work);
				},
				() => log.push("stage 1"),
				() => log.push("stage 2")
			)
		);
		log.push("settled");
		await pending!;

		expect(log.slice(0, 4)).toEqual(["rendered", "stage 1", "stage 2", "settled"]);
		expect(log.slice(4).toSorted()).toEqual(["file", "timer"]);
	});

	it("runs the ticks of a stage before its promise reactions, as Node.js does", async () => {
		const log: string[] = [];

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					void Promise.resolve().then(() => log.push("reaction"));
					process.nextTick((value: string) => log.push(value), "tick");
				},
				() => log.push("stage 1")
			)
		);

		expect(log).toEqual(["tick", "reaction", "stage 1"]);
	});

	// Next.js gives up on the input of a cached function with `Promise.resolve().then(() => process.nextTick(abort))`.
	it.each([1, 2, 128])(
		"runs a tick that a promise reaction scheduled after an input that is %i awaits deep",
		async (depth) => {
			const log: string[] = [];

			await inRequest(() =>
				runInSequentialTasks(
					() => {
						void Promise.resolve().then(() => process.nextTick(() => log.push("abort")));
						void awaitTimes(depth).then(() => log.push("input"));
					},
					() => log.push("stage 1")
				)
			);

			expect(log).toEqual(["input", "abort", "stage 1"]);
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

	it("passes the arguments and the async context to an immediate and to a tick", async () => {
		const log: string[] = [];
		const storage = new AsyncLocalStorage<string>();

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					storage.run("immediate context", () =>
						setImmediate((a: string, b: string) => log.push(`${a}${b} in ${storage.getStore()}`), "a", "b")
					);
					storage.run("tick context", () =>
						process.nextTick((a: string) => log.push(`${a} in ${storage.getStore()}`), "c")
					);
				},
				() => log.push("stage 1")
			)
		);

		expect(log).toEqual(["c in tick context", "ab in immediate context", "stage 1"]);
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

	it("rejects an immediate of the promise API that was aborted", async () => {
		const setImmediatePromise = (
			globalThis.setImmediate as unknown as {
				[promisify.custom]: (value: string, options: { signal: AbortSignal }) => Promise<string>;
			}
		)[promisify.custom];
		let aborted: Promise<string>;

		await inRequest(() =>
			runInSequentialTasks(() => {
				aborted = setImmediatePromise("value", { signal: AbortSignal.abort() });
				aborted.catch(() => {});
			})
		);

		await expect(aborted!).rejects.toMatchObject({ name: "AbortError" });
	});

	it.each([
		["the global `clearImmediate`", (immediate: NodeJS.Immediate) => clearImmediate(immediate)],
		["`clearImmediate` from `node:timers`", (immediate: NodeJS.Immediate) => nativeClearImmediate(immediate)],
		["`Symbol.dispose`", (immediate: NodeJS.Immediate) => immediate[Symbol.dispose]()],
	])("does not run an immediate that %s cancelled", async (_, cancel) => {
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
		await nextTask();

		expect(log).toEqual(["stage 1", "next render"]);
	});

	it("returns an immediate with the methods of a native one", async () => {
		let immediate: NodeJS.Immediate;

		await inRequest(() =>
			runInSequentialTasks(() => {
				immediate = setImmediate(() => {});
			})
		);

		expect(immediate!.unref().ref()).toBe(immediate!);
		expect(immediate!.hasRef()).toBe(false);
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

	it("runs a render that a stage started after the stages of the current one", async () => {
		const log: string[] = [];
		let nested: Promise<unknown>;

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					log.push("a0");
					nested = runInSequentialTasks(
						() => log.push("b0"),
						() => log.push("b1")
					);
				},
				() => log.push("a1")
			)
		);
		await nested!;

		expect(log).toEqual(["a0", "a1", "b0", "b1"]);
	});

	it("does not run the immediates of another request", async () => {
		const log: string[] = [];
		let otherRequestIsActive = true;
		const keepScheduling = () => {
			if (otherRequestIsActive) setImmediate(keepScheduling);
		};
		inRequest(keepScheduling);

		try {
			await inRequest(() =>
				runInSequentialTasks(
					() => {
						// A callback that kept the async context of another request.
						inRequest(() => setImmediate(() => log.push("other request")));
						setImmediate(() => log.push("flush"));
					},
					() => log.push("stage 1")
				)
			);
			log.push("settled");
			await nextTask();
		} finally {
			otherRequestIsActive = false;
		}

		expect(log).toEqual(["flush", "stage 1", "settled", "other request"]);
	});

	it("leaves an immediate that was scheduled before the render to the event loop", async () => {
		const log: string[] = [];

		await inRequest(() => {
			setImmediate(() => log.push("scheduled before"));
			return runInSequentialTasks(
				() => log.push("stage 0"),
				() => log.push("stage 1")
			);
		});

		expect(log).toEqual(["scheduled before", "stage 0", "stage 1"]);
	});

	// Next.js tracks the native immediates of a render this way from 16.4.1.
	it("settles when a `setImmediate` installed later schedules an immediate on every call", async () => {
		const log: string[] = [];
		let sentinel: NodeJS.Immediate | null = null;
		let checkAgain = false;
		const scheduleIdleCheck = () => {
			if (sentinel) {
				checkAgain = true;
				return;
			}
			sentinel = capturingSetImmediate(() => {
				sentinel = null;
				if (checkAgain) {
					checkAgain = false;
					scheduleIdleCheck();
				}
			});
		};
		globalThis.setImmediate = ((callback: () => void) => {
			const immediate = capturingSetImmediate(callback);
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
			globalThis.setImmediate = capturingSetImmediate;
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
						setImmediate(() => log.push("immediate of the failed stage"));
						process.nextTick(() => log.push("tick of the failed stage"));
						throw new Error("stage failed");
					},
					() => log.push("skipped")
				)
			).rejects.toThrow("stage failed");

			await runInSequentialTasks(() => log.push("next render"));
		});

		// What the failed stage scheduled is not lost: it runs from the event loop.
		expect(log).toEqual([
			"first",
			"tick of the failed stage",
			"immediate of the failed stage",
			"next render",
		]);
	});

	it("rejects with the error of the promise that the first stage returned when a later stage rejects it", async () => {
		const render = Promise.withResolvers<string>();

		await expect(
			inRequest(() =>
				runInSequentialTasks(
					() => render.promise,
					() => render.reject(new Error("render aborted"))
				)
			)
		).rejects.toThrow("render aborted");
	});

	it("does not wait for the promise of the first stage before it runs the next stages", async () => {
		const log: string[] = [];
		const stream = Promise.withResolvers<string>();

		const result = await inRequest(() =>
			runInSequentialTasks(
				async () => {
					log.push("stage 0");
					return stream.promise;
				},
				() => log.push("stage 1"),
				() => stream.resolve("stream closed")
			)
		);

		expect(result).toEqual("stream closed");
		expect(log).toEqual(["stage 0", "stage 1"]);
	});

	it("runs the next stage after a stage that yields to the immediates 3000 times", async () => {
		const log: string[] = [];

		await inRequest(() =>
			runInSequentialTasks(
				() => {
					void (async () => {
						for (let i = 0; i < 3000; i++) await new Promise((resolve) => setImmediate(resolve));
						log.push("yielded 3000 times");
					})();
				},
				() => log.push("stage 1")
			)
		);

		expect(log).toEqual(["yielded 3000 times", "stage 1"]);
	});
});
