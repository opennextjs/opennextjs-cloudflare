/**
 * Next.js uses one Node.js timers phase to keep native I/O between render stages out of Cache
 * Components output. workerd can deliver I/O between timers, so this runner advances all stages in
 * one workerd task. It drains the render's ticks, promise reactions and immediates before advancing.
 *
 * With `unhandled_rejection_after_microtask_checkpoint`, workerd dispatches promise rejection events
 * after draining the microtask queue. The listener in `init.ts` forwards the runner's own events.
 * Without the flag or after the checkpoint budget runs out, a bounded microtask wait can advance the
 * stage early. The runner still completes its stages before returning to the event loop.
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

type StageGroup = {
	requestContext: unknown;
	ticks: Task[];
	immediates: CapturedImmediate[];
	checkpoints: number;
	pendingCheckpoint?: { signal: Promise<unknown>; resolve: Task; reject: (error: Error) => void };
};

/** Set by `init.ts` when it listens for the checkpoint rejections. */
type CheckpointHub = { onCheckpoint?: (signal: Promise<unknown>) => void };

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
let checkpointAvailable = checkpointHub !== undefined;
if (checkpointHub) {
	checkpointHub.onCheckpoint = (signal) => {
		const group = capturingGroup();
		const pending = group?.pendingCheckpoint;
		if (group && pending?.signal === signal) {
			group.pendingCheckpoint = undefined;
			pending.resolve();
		}
	};
}

/** Resolves when the microtask queue is empty, before the task ends. */
function microtaskCheckpoint(group: StageGroup): Promise<void> {
	return new Promise((resolve, reject) => {
		group.pendingCheckpoint = { signal: Promise.reject(CHECKPOINT), resolve, reject };
		group.checkpoints++;
	});
}

async function waitMicrotasks(count: number, isDone?: () => boolean): Promise<boolean> {
	for (let index = 0; index < count; index++) {
		await null;
		if (isDone?.()) return true;
	}
	return false;
}

/**
 * Run ticks, then let promise reactions run. Repeat if the reactions schedule ticks. Each immediate
 * starts a new round. When workerd can report a checkpoint, the runner can skip polling the queues.
 */
async function settle(group: StageGroup, hasCheckpoint: boolean): Promise<void> {
	const hasTicks = () => group.ticks.length > 0;

	for (;;) {
		runTicks(group);
		const hasPendingImmediate = hasImmediate(group);
		const limit = hasPendingImmediate ? TASK_SEPARATION_CHECKPOINTS : MAX_CHECKPOINTS_PER_TASK;

		if (hasCheckpoint && group.checkpoints < limit) {
			await microtaskCheckpoint(group);
		} else if (!hasPendingImmediate) {
			if (await waitMicrotasks(QUIET_MICROTASKS, () => !hasTicks() && hasImmediate(group))) continue;
		} else if (await waitMicrotasks(NEARBY_MICROTASKS, hasTicks)) {
			// Reserve the remaining checkpoints for ticks and stage boundaries.
			if (hasCheckpoint && group.checkpoints < MAX_CHECKPOINTS_PER_TASK) {
				await microtaskCheckpoint(group);
			} else {
				await waitMicrotasks(QUIET_MICROTASKS);
			}
		}

		if (hasTicks()) continue;
		if (!hasImmediate(group)) return;
		runNextImmediate(group);
	}
}

async function runStages<T>(
	first: () => T,
	rest: Array<() => void>,
	group: StageGroup,
	runInContext: <R>(run: () => R) => R
): Promise<T> {
	// A queued render can start before the previous render's end-of-task watchdog.
	if (activeGroup?.pendingCheckpoint) checkpointAvailable = false;
	activeGroup = group;
	const hasCheckpoint = checkpointAvailable;
	// An application rejection listener can prevent workerd from dispatching later checkpoints.
	// If the task ends while the runner waits, reject the staged result before any stage advances.
	const taskEnded = hasCheckpoint
		? nativeSetImmediate(() => {
				const pending = group.pendingCheckpoint;
				if (!pending) return;
				checkpointAvailable = false;
				group.pendingCheckpoint = undefined;
				pending.reject(new Error(MISSING_CHECKPOINT));
			})
		: undefined;

	try {
		const result = runInContext(first);
		// A later stage can reject this promise. The caller observes it through the returned promise.
		if (isThenable(result)) result.then(noop, noop);
		await settle(group, hasCheckpoint);
		for (const stage of rest) {
			runInContext(stage);
			await settle(group, hasCheckpoint);
		}
		return result;
	} finally {
		if (taskEnded !== undefined) nativeClearImmediate(taskEnded);
		if (activeGroup === group) activeGroup = null;
		// After an error. The immediates that are left run from their native immediate.
		for (const tick of group.ticks) nativeNextTick(tick);
	}
}

/** Runs the render stages and drains their work within one workerd task. */
export function runInSequentialTasks<T>(first: () => T, ...rest: Array<() => void>): Promise<T> {
	const group: StageGroup = {
		requestContext: globals[REQUEST_CONTEXT],
		ticks: [],
		immediates: [],
		checkpoints: 0,
	};
	const runInContext = AsyncLocalStorage.snapshot();

	return new Promise<T>((resolve, reject) => {
		// Start with a fresh checkpoint budget after any running stages have settled.
		nativeSetImmediate(() => {
			runStages(first, rest, group, runInContext).then(resolve, reject);
		});
	});
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
