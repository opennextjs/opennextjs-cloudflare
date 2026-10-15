/**
 * Next.js runs each render stage in its own task and finds the end of a task with `process.nextTick`.
 * workerd implements `process.nextTick` as `queueMicrotask`, so the stage boundary lands before
 * React has scheduled its work.
 *
 * Immediates run in scheduling order, with the microtasks drained between them. A stage has settled
 * when an immediate runs and the request scheduled no other immediate in the meantime.
 *
 * See https://github.com/cloudflare/workerd/issues/7687
 */

import { setImmediate as setImmediatePromise } from "node:timers/promises";
import { promisify } from "node:util";

type RequestScope = { scheduledImmediates: number; lastRender: Promise<void> };

type PromisifiedSetImmediate = typeof setImmediatePromise;

// Captured before Next.js replaces them: the stage hops must not be counted, and Next.js makes its
// own `node:timers/promises` `setImmediate` call back into this module.
const nativeSetImmediate = globalThis.setImmediate;
const nativeSetImmediatePromise = setImmediatePromise;

const REQUEST_CONTEXT = Symbol.for("__cloudflare-context__");

// Scoped to the request: React resumes work from promises created before the staged run, and one
// request must not wait on another.
const scopes = new WeakMap<object, RequestScope>();
const scopeOutsideRequest: RequestScope = { scheduledImmediates: 0, lastRender: Promise.resolve() };

function currentScope(): RequestScope {
	const context = (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
	if (typeof context !== "object" || context === null) {
		return scopeOutsideRequest;
	}

	let scope = scopes.get(context);
	if (!scope) {
		scope = { scheduledImmediates: 0, lastRender: Promise.resolve() };
		scopes.set(context, scope);
	}
	return scope;
}

// Counts scheduling, not pending immediates: `Symbol.dispose` and the `clearImmediate` of
// `node:timers` cancel an immediate without the global `clearImmediate`.
function countedSetImmediate(callback: (...args: unknown[]) => void, ...args: unknown[]) {
	currentScope().scheduledImmediates++;
	return nativeSetImmediate(callback, ...args);
}

const countedSetImmediatePromise = ((value, options) => {
	currentScope().scheduledImmediates++;
	return nativeSetImmediatePromise(value, options);
}) as PromisifiedSetImmediate;

// Next.js reads this hook when it installs its own `node:timers/promises` `setImmediate`. Node.js
// defines the hook on the global function, workerd does not.
Object.defineProperty(countedSetImmediate, promisify.custom, { value: countedSetImmediatePromise });

globalThis.setImmediate = countedSetImmediate as unknown as typeof setImmediate;

// Next.js also keeps the original in a registry that the first copy of `fast-set-immediate` to load
// fills. The Node.js middleware bundle has a copy and loads before the server, so the registry can
// already hold the native function, and the server would then send every immediate to it.
const NEXT_ORIGINALS = Symbol.for("next.fast-set-immediate.originals");
const nextOriginals = (globalThis as Record<symbol, { setImmediate: unknown } | undefined>)[NEXT_ORIGINALS];
if (nextOriginals) {
	nextOriginals.setImmediate = countedSetImmediate;
}

const MAX_TASKS_PER_STAGE = 1000;

/** Drop-in for `runInSequentialTasks` from Next.js: each callback runs in its own settled task. */
export function runInSequentialTasks<T>(first: () => T, ...rest: Array<() => void>): Promise<T> {
	const scope = currentScope();
	const previousRender = scope.lastRender;
	let endRender!: () => void;
	scope.lastRender = new Promise<void>((resolve) => (endRender = resolve));

	return new Promise<T>((resolve, reject) => {
		const stages = [first, ...rest];
		let result: T;

		const fail = (error: unknown) => {
			endRender();
			reject(error);
		};

		const afterImmediates = (next: () => void, tasks = 0) => {
			const scheduled = scope.scheduledImmediates;
			nativeSetImmediate(() => {
				if (scope.scheduledImmediates === scheduled) {
					next();
				} else if (tasks < MAX_TASKS_PER_STAGE) {
					afterImmediates(next, tasks + 1);
				} else {
					fail(
						new Error(
							`Cache Components render did not settle: the request still schedules immediates after ${MAX_TASKS_PER_STAGE} tasks.`
						)
					);
				}
			});
		};

		const runStage = (index: number) => {
			try {
				const value = stages[index]!();
				if (index === 0) {
					result = value as T;
					// A later stage can reject this promise. The caller observes it through the returned promise.
					if (isThenable(result)) {
						result.then(noop, noop);
					}
				}
			} catch (error) {
				fail(error);
				return;
			}

			afterImmediates(() => {
				if (index + 1 < stages.length) {
					runStage(index + 1);
				} else {
					endRender();
					resolve(result);
				}
			});
		};

		// Next.js runs one group of stage timers at a time, so the renders of a request must not interleave.
		void previousRender.then(() => nativeSetImmediate(() => runStage(0)));
	});
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function"
	);
}

function noop(): void {}
