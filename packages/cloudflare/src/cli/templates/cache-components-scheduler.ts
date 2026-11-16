/**
 * Next.js runs the stages of a Cache Components render as timers of a single Node.js timers phase,
 * and runs the immediates of a stage from `process.nextTick`. No I/O completes between two stages,
 * so a stage holds exactly the work that was ready when it started, and Next.js treats the rest as
 * uncached data.
 *
 * workerd delivers I/O between any two timers, and its `process.nextTick` is a microtask, which
 * cannot tell when a task has ended.
 *
 * This runner keeps the stages of a render in one task: it runs the ticks and the immediates of the
 * render from its own queues and does not return to the event loop before the last stage has
 * settled, so no I/O is delivered to the render in between.
 *
 * A stage has settled when the microtask queue is empty and both queues are. workerd reports an
 * empty microtask queue through the `unhandledrejection` event, which it dispatches at the end of
 * the microtask checkpoint, within the task. The runner rejects a promise to get the event, and the
 * listener in `init.ts` reports it back. That needs the
 * `unhandled_rejection_after_microtask_checkpoint` compatibility flag, on by default from the
 * `2026-03-03` compatibility date, and workerd runs at most 64 extra checkpoints per task. Without
 * the flag or past that budget the runner waits for microtasks that schedule nothing instead. That
 * can end a stage early, which makes cached content dynamic. It never makes uncached data static.
 *
 * See https://github.com/cloudflare/workerd/issues/7687
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { TimerOptions } from "node:timers";
import { setImmediate as setImmediatePromise } from "node:timers/promises";
import { promisify } from "node:util";

type Task = () => void;

type AnyCallback = (...args: unknown[]) => void;

/** A callback of the render that the runner calls before the native immediate does. */
type CapturedImmediate = { run: Task | null; native: NodeJS.Immediate | null };

type StageGroup = { requestContext: unknown; ticks: Task[]; immediates: CapturedImmediate[] };

/** Set by `init.ts` when it listens for the checkpoint rejections. */
type CheckpointHub = { onCheckpoint?: () => void };

type NextOriginals = { setImmediate: unknown; clearImmediate: unknown; nextTick: unknown };

// workerd runs the first checkpoint of a task and at most 64 more. A callback that is still queued
// after the last one runs in a later task, where workerd can cancel the request as hung.
const MAX_CHECKPOINTS_PER_TASK = 56;

// Checkpoints that may separate two immediates. The rest is kept for the end of the stages.
const TASK_SEPARATION_CHECKPOINTS = 24;

// React schedules its next immediate within a few microtasks of the previous one.
const NEARBY_MICROTASKS = 64;

// The microtasks without activity that end a stage when there is no checkpoint to wait for.
const QUIET_MICROTASKS = 1024;

// Long enough to tell a checkpoint from a microtask.
const PROBE_MICROTASKS = 8;

const MISSING_CHECKPOINT =
	"The render was stopped because workerd did not dispatch the `unhandledrejection` event that ends a Cache Components render stage.";

const REQUEST_CONTEXT = Symbol.for("__cloudflare-context__");
const NEXT_ORIGINALS = Symbol.for("next.fast-set-immediate.originals");
// Note: this symbol needs to be kept in sync with `init.ts`
const CHECKPOINT = Symbol.for("__opennext-microtask-checkpoint__");

const globals = globalThis as unknown as {
	[REQUEST_CONTEXT]?: unknown;
	[NEXT_ORIGINALS]?: NextOriginals;
	[CHECKPOINT]?: CheckpointHub;
};

// Captured before Next.js replaces them. Next.js sends the calls that it does not capture itself to the
// functions installed below, and patches `node:timers` to do the same.
const nativeSetImmediate = globalThis.setImmediate;
const nativeClearImmediate = globalThis.clearImmediate;
const nativeSetImmediatePromise = setImmediatePromise;
const nativeNextTick = process.nextTick;

// A group never outlives its task, so at most one is active.
let activeGroup: StageGroup | null = null;

const capturedImmediates = new WeakMap<object, CapturedImmediate>();

let pendingCheckpoint: { resolve: Task; reject: (error: Error) => void } | null = null;
let checkpointsInTask = 0;
let checkpointSupport: Promise<boolean> | undefined;

/**
 * The group that owns the current task. A group stays set when workerd ends its request in the
 * middle of a stage, so a call from another request is not part of it.
 */
function capturingGroup(): StageGroup | null {
	return activeGroup !== null && activeGroup.requestContext === globals[REQUEST_CONTEXT] ? activeGroup : null;
}

// The native immediate stays scheduled: it carries `ref`, `unref` and `Symbol.dispose`, and it runs
// the callback when the group does not, after a stage threw for example.
function capturingSetImmediate(callback: AnyCallback, ...args: unknown[]): NodeJS.Immediate {
	const group = capturingGroup();
	if (group === null || typeof callback !== "function") {
		return nativeSetImmediate(callback, ...args);
	}

	const runInContext = AsyncLocalStorage.snapshot();
	const captured: CapturedImmediate = { run: () => runInContext(callback, ...args), native: null };
	const native = nativeSetImmediate(() => {
		const { run } = captured;
		captured.run = null;
		run?.();
	});
	captured.native = native;
	capturedImmediates.set(native, captured);
	observeDispose(native, captured);
	group.immediates.push(captured);
	return native;
}

function capturingClearImmediate(immediate: NodeJS.Immediate | undefined): void {
	if (typeof immediate === "object" && immediate !== null) {
		const captured = capturedImmediates.get(immediate);
		if (captured) captured.run = null;
	}
	nativeClearImmediate(immediate);
}

// The native promise stays in charge of the abort signal and of the validation of the arguments.
function capturingSetImmediatePromise<T = void>(value?: T, options?: TimerOptions): Promise<T> {
	const group = capturingGroup();
	const native = nativeSetImmediatePromise(value, options);
	if (group === null) {
		return native;
	}

	return new Promise<T>((resolve, reject) => {
		native.then(resolve, reject);
		group.immediates.push({ run: () => resolve(value as T), native: null });
	});
}

function capturingNextTick(callback: AnyCallback, ...args: unknown[]): void {
	const group = capturingGroup();
	if (group === null || typeof callback !== "function") {
		nativeNextTick(callback, ...args);
		return;
	}

	const runInContext = AsyncLocalStorage.snapshot();
	group.ticks.push(() => runInContext(callback, ...args));
}

/**
 * workerd does not show that an immediate was cleared. The global `clearImmediate` is wrapped, and
 * so is `Symbol.dispose` here. `clearImmediate` imported by name from `node:timers` is not.
 */
function observeDispose(native: NodeJS.Immediate, captured: CapturedImmediate): void {
	const dispose = native[Symbol.dispose];
	try {
		Object.defineProperty(native, Symbol.dispose, {
			configurable: true,
			value: () => {
				captured.run = null;
				return dispose.call(native);
			},
		});
	} catch {
		// The immediate is not extensible. The callback of a disposed immediate would run.
	}
}

/** The callback of an immediate that the group runs ahead of the native one. */
function takeImmediate(captured: CapturedImmediate): Task | null {
	const { run, native } = captured;
	captured.run = null;
	// Node.js marks the immediates that it cleared.
	return native !== null && (native as { _destroyed?: boolean })._destroyed === true ? null : run;
}

function hasImmediate(group: StageGroup): boolean {
	const { immediates } = group;
	let cleared = 0;
	while (cleared < immediates.length && immediates[cleared]!.run === null) cleared++;
	if (cleared > 0) immediates.splice(0, cleared);
	return immediates.length > 0;
}

function runNextImmediate(group: StageGroup): void {
	const captured = group.immediates.shift();
	if (!captured) return;

	const run = takeImmediate(captured);
	if (run === null) return;
	if (captured.native !== null) nativeClearImmediate(captured.native);
	runTask(run);
}

/** Node.js runs all the ticks of a task, the ones they schedule included, before a promise reaction. */
function runTicks(group: StageGroup): void {
	for (let index = 0; index < group.ticks.length; index++) {
		runTask(group.ticks[index]!);
	}
	group.ticks.length = 0;
}

// An error of a tick or of an immediate is uncaught, and must not stop the stages.
function runTask(task: Task): void {
	try {
		task();
	} catch (error) {
		queueMicrotask(() => {
			throw error;
		});
	}
}

const checkpointHub = globals[CHECKPOINT];
if (checkpointHub) {
	checkpointHub.onCheckpoint = () => {
		const pending = pendingCheckpoint;
		pendingCheckpoint = null;
		pending?.resolve();
	};
}

/** Resolves when the microtask queue is empty, before the task ends. */
function microtaskCheckpoint(): Promise<void> {
	return new Promise((resolve, reject) => {
		pendingCheckpoint = { resolve, reject };
		checkpointsInTask++;
		void Promise.reject(CHECKPOINT);
	});
}

async function waitMicrotasks(count: number, isDone?: () => boolean): Promise<boolean> {
	for (let index = 0; index < count; index++) {
		await null;
		if (isDone?.()) return true;
	}
	return false;
}

/** Without the compatibility flag the event is dispatched from a microtask, ahead of the reactions. */
function hasMicrotaskCheckpoint(): Promise<boolean> {
	checkpointSupport ??=
		checkpointHub !== undefined
			? (async () => {
					let reactionsRan = false;
					void waitMicrotasks(PROBE_MICROTASKS).then(() => (reactionsRan = true));
					const atCheckpoint = microtaskCheckpoint().then(() => reactionsRan);
					const atNextTask = new Promise<boolean>((resolve) => nativeSetImmediate(() => resolve(false)));
					return Promise.race([atCheckpoint, atNextTask]);
				})()
			: Promise.resolve(false);
	return checkpointSupport;
}

/**
 * Resolves at the end of the current stage: no tick, no promise reaction and no immediate is left.
 *
 * It follows the order of a Node.js task: the ticks that the task scheduled, then the promise
 * reactions, then the ticks that the reactions scheduled, and so on until both are done. The next
 * immediate is the next task.
 */
async function settle(group: StageGroup, hasCheckpoint: boolean): Promise<void> {
	const hasWork = () => group.ticks.length > 0 || hasImmediate(group);

	// Waits for the microtask queue to be empty, or for long enough that it is likely to be.
	const drain = async (isDone?: () => boolean) => {
		if (hasCheckpoint && checkpointsInTask < MAX_CHECKPOINTS_PER_TASK) {
			await microtaskCheckpoint();
		} else {
			await waitMicrotasks(QUIET_MICROTASKS, isDone);
		}
	};

	for (;;) {
		runTicks(group);

		if (!hasImmediate(group)) {
			// Look for what the reactions schedule before paying for a checkpoint.
			const found = await waitMicrotasks(NEARBY_MICROTASKS, hasWork);
			if (found && group.ticks.length === 0) continue;
			await drain(found ? undefined : hasWork);
			if (!hasWork()) return;
			continue;
		}

		if (hasCheckpoint && checkpointsInTask < TASK_SEPARATION_CHECKPOINTS) {
			await microtaskCheckpoint();
		} else {
			// The order of the immediates within a stage matters less than the end of the stage.
			await waitMicrotasks(NEARBY_MICROTASKS, () => group.ticks.length > 0);
			if (group.ticks.length > 0) await drain();
		}
		if (group.ticks.length === 0) runNextImmediate(group);
	}
}

async function runStages<T>(
	stages: Array<() => unknown>,
	group: StageGroup,
	runInContext: <R>(run: () => R) => R,
	hasCheckpoint: boolean
): Promise<T> {
	activeGroup = group;
	// A request that workerd ended in the middle of a stage leaves its state behind.
	pendingCheckpoint = null;
	checkpointsInTask = 0;

	// workerd stops dispatching `unhandledrejection` once a listener of the app has rejected a promise
	// during a dispatch. The task then ends while a stage waits, and I/O can reach the render. The
	// render fails rather than cache that data, and the next ones do not wait for a checkpoint.
	const taskEnded = nativeSetImmediate(() => {
		if (activeGroup !== group) return;
		checkpointSupport = Promise.resolve(false);
		pendingCheckpoint?.reject(new Error(MISSING_CHECKPOINT));
		pendingCheckpoint = null;
	});

	try {
		let result: unknown;
		for (const [index, stage] of stages.entries()) {
			const value = runInContext(stage);
			if (index === 0) {
				result = value;
				// A later stage can reject this promise. The caller observes it through the returned promise.
				if (isThenable(result)) {
					result.then(noop, noop);
				}
			}
			await settle(group, hasCheckpoint);
		}
		return result as T;
	} finally {
		nativeClearImmediate(taskEnded);
		if (activeGroup === group) activeGroup = null;
		// After an error. The immediates that are left run from their native immediate.
		for (const tick of group.ticks) nativeNextTick(tick);
	}
}

/** Drop-in for `runInSequentialTasks` from Next.js: each callback runs in its own settled task. */
export function runInSequentialTasks<T>(first: () => T, ...rest: Array<() => void>): Promise<T> {
	const group: StageGroup = { requestContext: globals[REQUEST_CONTEXT], ticks: [], immediates: [] };
	const runInContext = AsyncLocalStorage.snapshot();

	return hasMicrotaskCheckpoint().then(
		(hasCheckpoint) =>
			new Promise<T>((resolve, reject) => {
				// As the first timer of Next.js does, the stages start in a task of their own. It has the
				// whole checkpoint budget, and the stages of a render that started first are done.
				nativeSetImmediate(() => {
					runStages<T>([first, ...rest], group, runInContext, hasCheckpoint).then(resolve, reject);
				});
			})
	);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function"
	);
}

function noop(): void {}

// Next.js reads this hook when it installs its own `node:timers/promises` `setImmediate`. Node.js
// defines the hook on the global function, workerd does not.
Object.defineProperty(capturingSetImmediate, promisify.custom, { value: capturingSetImmediatePromise });

globalThis.setImmediate = capturingSetImmediate as unknown as typeof setImmediate;
globalThis.clearImmediate = capturingClearImmediate as typeof clearImmediate;
process.nextTick = capturingNextTick as typeof process.nextTick;

// Next.js also keeps the originals in a registry that the first copy of `fast-set-immediate` to load
// fills. The Node.js middleware bundle has a copy and loads before the server, so the registry can
// already hold the native functions, and the server would then send every call to them.
const nextOriginals = globals[NEXT_ORIGINALS];
if (nextOriginals) {
	nextOriginals.setImmediate = capturingSetImmediate;
	nextOriginals.clearImmediate = capturingClearImmediate;
	nextOriginals.nextTick = capturingNextTick;
}
