/**
 * Cache Components staged rendering for workerd.
 *
 * Next drains the immediates React queued between two stages so each stage flushes before the next
 * unblocks more content. It builds that boundary from `process.nextTick`, which workerd implements
 * as `queueMicrotask`, so the drain ends before React has scheduled its flush and the render slips a
 * stage. workerd runs timers and immediates from one ordered macrotask queue and drains microtasks
 * between two of them, so an immediate is an exact "everything queued before me has run" signal:
 * count the outstanding ones and hop until none remain.
 */

import { AsyncLocalStorage } from "node:async_hooks";

type StagedRun = { pending: number; scope: RequestScope };

/** Immediates the request caused that no staged run owns. Shared by the request's renders. */
type RequestScope = { unattributed: number };

type ScheduleMacrotask = (callback: () => void) => unknown;

/** Keeps one render from waiting on another's immediates. */
const runStorage = new AsyncLocalStorage<StagedRun>();

const REQUEST_CONTEXT = Symbol.for("__cloudflare-context__");

/**
 * Next awaits the RSC payload before it stages, so React resumes from promises created outside the
 * run where `runStorage` cannot see it - which is why Next's own capture is process wide. The
 * request is the next widest owner that still keeps one request from gating another.
 */
const scopes = new WeakMap<object, RequestScope>();
const isolateScope: RequestScope = { unattributed: 0 };

function currentScope(): RequestScope {
	const context = (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
	if (typeof context !== "object" || context === null) {
		return isolateScope;
	}

	let scope = scopes.get(context);
	if (!scope) {
		scope = { unattributed: 0 };
		scopes.set(context, scope);
	}
	return scope;
}

/** Fail rather than advance a stage over work it still owns, which is what truncates responses. */
const MAX_SETTLE_HOPS = 1000;

const COUNTED = Symbol.for("__opennext.cache-components.countedSetImmediate");

let scheduleMacrotask: ScheduleMacrotask | undefined;

/** Next patches `setImmediate` when its server environment loads, so wrap whatever is installed. */
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
		// A render must also wait for work it did not root itself, so charge the rest to the request.
		const owner = run ?? currentScope();
		if (owner === isolateScope) {
			return previousSetImmediate(callback, ...args);
		}

		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			if (run) run.pending--;
			else (owner as RequestScope).unattributed--;
		};

		if (run) run.pending++;
		else (owner as RequestScope).unattributed++;
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
			// Nothing was scheduled, so nothing will settle the count.
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

/** Drop-in for Next's `runInSequentialTasks`: each callback gets its own settled task. */
export function runInSequentialTasks<T>(first: () => T, ...rest: Array<() => void>): Promise<T> {
	const hop = install();
	const run: StagedRun = { pending: 0, scope: currentScope() };

	return new Promise<T>((resolve, reject) => {
		let result: T;
		let stage = 0;
		let hops = 0;

		const settleThen = (next: () => void) => {
			hop(() => {
				const pending = run.pending + run.scope.unattributed;
				if (pending === 0) {
					next();
					return;
				}
				if (hops++ < MAX_SETTLE_HOPS) {
					settleThen(next);
					return;
				}
				reject(
					new Error(
						`Cache Components render did not settle: ${pending} immediate(s) still pending after ${MAX_SETTLE_HOPS} tasks.`
					)
				);
			});
		};

		const enterStage = () => {
			try {
				runStorage.run(run, () => {
					if (stage === 0) {
						result = first();
						// A later task may reject this; the caller sees it through the returned promise.
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
