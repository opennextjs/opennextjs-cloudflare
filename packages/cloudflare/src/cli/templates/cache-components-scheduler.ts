/**
 * Cache Components staged rendering for workerd.
 *
 * Next renders Cache Components as a pipeline of tasks and, between two of them, runs every
 * immediate the previous task queued so React flushes that stage before the next one unblocks more
 * content. On Node it gets that boundary from `process.nextTick`, which runs once the microtask
 * queue is exhausted. workerd implements `process.nextTick` with `queueMicrotask`, so Next's drain
 * gives up two microtask hops in - before React has scheduled its flush - and the render slips a
 * stage behind. Runtime prefetches drop every chunk that arrives after their last task aborts the
 * render, so the slip reaches the client as a prefetch body holding only the one byte partial
 * marker, and a full render loses whatever the last stage produced.
 *
 * workerd runs timers and immediates from a single ordered macrotask queue and always drains
 * microtasks between two of them, so scheduling an immediate is an exact "everything queued before
 * me has run" signal. Count the immediates each staged render causes and hop until that count
 * reaches zero before entering the next stage. Next's own fast-immediate capture is never engaged,
 * which also keeps its process-wide capture slot free while requests overlap.
 */

import { AsyncLocalStorage } from "node:async_hooks";

type StagedRun = { pending: number };

type ScheduleMacrotask = (callback: () => void) => unknown;

/** Attributes an immediate to the staged render that caused it, so one render never waits on another. */
const runStorage = new AsyncLocalStorage<StagedRun>();

/**
 * Bound on the tasks one stage waits for its own immediates. An immediate we never see settle - one
 * cleared through a handle we did not hand out, or a render that never stops scheduling - fails the
 * render, because advancing a stage over work it still owns is what truncates responses.
 */
const MAX_SETTLE_HOPS = 1000;

const COUNTED = Symbol.for("__opennext.cache-components.countedSetImmediate");

let scheduleMacrotask: ScheduleMacrotask | undefined;

/**
 * Count the immediates of the running staged render. Next patches `setImmediate` when its server
 * environment loads, so wrap whatever is installed and keep delegating to it.
 */
function install(): ScheduleMacrotask {
	const current = globalThis.setImmediate as typeof setImmediate & { [COUNTED]?: true };
	if (scheduleMacrotask && current[COUNTED]) {
		return scheduleMacrotask;
	}

	const previousSetImmediate = globalThis.setImmediate;
	const previousClearImmediate = globalThis.clearImmediate;
	const releaseByImmediate = new WeakMap<object, () => void>();

	const countedSetImmediate = (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
		const run = runStorage.getStore();
		if (!run) {
			return previousSetImmediate(callback, ...args);
		}

		let released = false;
		const release = () => {
			if (!released) {
				released = true;
				run.pending--;
			}
		};

		run.pending++;
		try {
			const immediate = previousSetImmediate(() => {
				release();
				callback(...args);
			});
			if (typeof immediate === "object" && immediate !== null) {
				releaseByImmediate.set(immediate, release);
			}
			return immediate;
		} catch (error) {
			// A schedule that threw left nothing behind to settle the count.
			release();
			throw error;
		}
	};
	Object.defineProperty(countedSetImmediate, COUNTED, { value: true });

	const countedClearImmediate = (immediate: unknown) => {
		// A clear that threw left the immediate live, so it stays counted.
		previousClearImmediate(immediate as Parameters<typeof clearImmediate>[0]);
		if (typeof immediate === "object" && immediate !== null) {
			releaseByImmediate.get(immediate)?.();
		}
	};

	globalThis.setImmediate = countedSetImmediate as unknown as typeof setImmediate;
	globalThis.clearImmediate = countedClearImmediate as unknown as typeof clearImmediate;

	// Hops must not count themselves, so they go through the unwrapped function.
	scheduleMacrotask = previousSetImmediate as unknown as ScheduleMacrotask;
	return scheduleMacrotask;
}

function ignore(): void {}

/**
 * Drop-in replacement for Next's `runInSequentialTasks`: run `first`, then each of `rest` in its own
 * task, and resolve with whatever `first` returned once the last task has settled.
 */
export function runInSequentialTasks<T>(first: () => T, ...rest: Array<() => void>): Promise<T> {
	const hop = install();
	const run: StagedRun = { pending: 0 };

	return new Promise<T>((resolve, reject) => {
		let result: T;
		let stage = 0;
		let hops = 0;

		const settleThen = (next: () => void) => {
			hop(() => {
				if (run.pending === 0) {
					next();
					return;
				}
				if (hops++ < MAX_SETTLE_HOPS) {
					settleThen(next);
					return;
				}
				reject(
					new Error(
						`Cache Components render did not settle: ${run.pending} immediate(s) still pending after ${MAX_SETTLE_HOPS} tasks.`
					)
				);
			});
		};

		const enterStage = () => {
			try {
				runStorage.run(run, () => {
					if (stage === 0) {
						result = first();
						// A later task may reject this; the caller observes it through the returned promise.
						const thenable = result as PromiseLike<unknown> | null | undefined;
						if (thenable && typeof thenable.then === "function") {
							thenable.then(ignore, ignore);
						}
					} else {
						rest[stage - 1]!();
					}
				});
			} catch (error) {
				reject(error);
				return;
			}

			stage++;
			hops = 0;
			settleThen(stage > rest.length ? () => resolve(result) : enterStage);
		};

		// Start from a fresh task, the way Next's first timer does.
		hop(enterStage);
	});
}
