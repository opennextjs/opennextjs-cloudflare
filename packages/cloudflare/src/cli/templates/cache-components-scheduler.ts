/**
 * Cache Components staged rendering for workerd.
 *
 * Next.js runs each render stage in its own event loop task. Between two stages it runs the
 * immediates that React scheduled, so React flushes a stage before the next one unblocks more
 * content. Next.js finds the end of a task with `process.nextTick`, which workerd implements as
 * `queueMicrotask`: the callback runs before the render has scheduled its work, and the stage
 * boundary lands too early.
 *
 * Immediates run in the order in which they were scheduled, and the runtime drains the microtasks
 * between two of them. An immediate is then an exact "everything scheduled before me has run" signal.
 * A stage has settled when such an immediate runs and the request has scheduled no other immediate
 * in the meantime.
 *
 * See https://github.com/cloudflare/workerd/issues/7687
 */

import { setImmediate as setImmediatePromise } from "node:timers/promises";
import { promisify } from "node:util";

/** How many immediates a request has scheduled, and the end of its last staged render. */
type RequestScope = { scheduledImmediates: number; lastRender: Promise<void> };

type PromisifiedSetImmediate = typeof setImmediatePromise;

// Captured before Next.js replaces them: the stage hops must not be counted, and Next.js makes its
// own `node:timers/promises` `setImmediate` call back into this module.
const nativeSetImmediate = globalThis.setImmediate;
const nativeSetImmediatePromise = setImmediatePromise;

const REQUEST_CONTEXT = Symbol.for("__cloudflare-context__");

/**
 * Next.js awaits the RSC payload before it stages a render, so React resumes work from promises that
 * were created outside the staged run. The request is the narrowest owner that sees all of that work
 * and still keeps one request from waiting on another.
 */
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

// Only the scheduling is counted. To count the immediates that are still pending, every way to cancel
// one would have to be seen, and `Symbol.dispose` and the `clearImmediate` of `node:timers` do not go
// through the global `clearImmediate`.
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

// Next.js and React capture `setImmediate` while they load. This module loads first, so every
// reference they keep is counted.
globalThis.setImmediate = countedSetImmediate as unknown as typeof setImmediate;

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

		/** Calls `next` in the first task before which the request scheduled no new immediate. */
		const afterImmediates = (next: () => void, tasks = 0) => {
			// Read before the hop is queued: the hop runs after every immediate counted up to here.
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
