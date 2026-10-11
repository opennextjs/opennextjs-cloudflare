/**
 * Cache Components staged rendering for workerd.
 *
 * Next.js runs each render stage in its own event loop task. Between two stages it runs the
 * immediates that React scheduled, so React flushes a stage before the next one unblocks more
 * content. Next.js finds the end of a task with `process.nextTick`, which workerd implements as
 * `queueMicrotask`: the callback runs before the render has scheduled its work, and the stage
 * boundary lands too early.
 *
 * workerd runs timers and immediates from one ordered queue and drains the microtasks between two
 * of them. An immediate is then an exact "everything queued before me has run" signal: count the
 * immediates of the request and enter the next stage when none is left.
 *
 * See https://github.com/cloudflare/workerd/issues/7687
 */

import { setImmediate as setImmediatePromise } from "node:timers/promises";
import { promisify } from "node:util";

/** The immediates a request has scheduled and not run yet, and the end of its last staged render. */
type RequestScope = { pendingImmediates: number; lastRender: Promise<void> };

type PromisifiedSetImmediate = typeof setImmediatePromise;

// Captured before Next.js replaces them: the stage hops must not be counted, and Next.js makes its
// own `node:timers/promises` `setImmediate` call back into this module.
const nativeSetImmediate = globalThis.setImmediate;
const nativeClearImmediate = globalThis.clearImmediate;
const nativeSetImmediatePromise = setImmediatePromise;

const REQUEST_CONTEXT = Symbol.for("__cloudflare-context__");

/**
 * Next.js awaits the RSC payload before it stages a render, so React resumes work from promises that
 * were created outside the staged run. The request is the narrowest owner that sees all of that work
 * and still keeps one request from waiting on another.
 */
const scopes = new WeakMap<object, RequestScope>();
const scopeOutsideRequest: RequestScope = { pendingImmediates: 0, lastRender: Promise.resolve() };

function currentScope(): RequestScope {
	const context = (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
	if (typeof context !== "object" || context === null) {
		return scopeOutsideRequest;
	}

	let scope = scopes.get(context);
	if (!scope) {
		scope = { pendingImmediates: 0, lastRender: Promise.resolve() };
		scopes.set(context, scope);
	}
	return scope;
}

/** Counts an immediate of the current request, and returns the function that marks it as done. */
function trackImmediate(): () => void {
	const scope = currentScope();
	scope.pendingImmediates++;

	let done = false;
	return () => {
		if (done) return;
		done = true;
		scope.pendingImmediates--;
	};
}

const untrackByImmediate = new WeakMap<object, () => void>();

function countedSetImmediate(callback: (...args: unknown[]) => void, ...args: unknown[]) {
	const untrack = trackImmediate();
	let immediate: ReturnType<typeof nativeSetImmediate>;
	try {
		immediate = nativeSetImmediate(() => {
			untrack();
			callback(...args);
		});
	} catch (error) {
		// Nothing was scheduled, so nothing would mark the immediate as done.
		untrack();
		throw error;
	}
	untrackByImmediate.set(immediate, untrack);
	return immediate;
}

const countedSetImmediatePromise = ((value, options) => {
	const untrack = trackImmediate();
	try {
		return nativeSetImmediatePromise(value, options).finally(untrack);
	} catch (error) {
		untrack();
		throw error;
	}
}) as PromisifiedSetImmediate;

// Next.js reads this hook when it installs its own `node:timers/promises` `setImmediate`. Node.js
// defines the hook on the global function, workerd does not.
Object.defineProperty(countedSetImmediate, promisify.custom, { value: countedSetImmediatePromise });

function countedClearImmediate(immediate: Parameters<typeof nativeClearImmediate>[0]) {
	// A clear that throws leaves the immediate scheduled, so it stays counted.
	nativeClearImmediate(immediate);
	if (typeof immediate === "object" && immediate !== null) {
		untrackByImmediate.get(immediate)?.();
	}
}

// Next.js and React capture `setImmediate` while they load. This module loads first, so every
// reference they keep is counted.
globalThis.setImmediate = countedSetImmediate as unknown as typeof setImmediate;
globalThis.clearImmediate = countedClearImmediate as typeof clearImmediate;

/** A render whose immediates reschedule themselves forever must fail, not hang the request. */
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

		/** Calls `next` in the first task that finds no pending immediate. */
		const afterImmediates = (next: () => void, tasks = 0) => {
			nativeSetImmediate(() => {
				if (scope.pendingImmediates === 0) {
					next();
				} else if (tasks < MAX_TASKS_PER_STAGE) {
					afterImmediates(next, tasks + 1);
				} else {
					fail(
						new Error(
							`Cache Components render did not settle: ${scope.pendingImmediates} immediate(s) still pending after ${MAX_TASKS_PER_STAGE} tasks.`
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

		// Next.js runs one group of stage timers at a time, so the staged renders of a request do not
		// interleave. Renders of other requests are independent.
		void previousRender.then(() => nativeSetImmediate(() => runStage(0)));
	});
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function"
	);
}

function noop(): void {}
