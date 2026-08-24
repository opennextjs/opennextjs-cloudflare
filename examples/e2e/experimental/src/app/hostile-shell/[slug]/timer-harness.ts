import { setImmediate as timersSetImmediate } from "node:timers";
import { setImmediate as timersPromisesSetImmediate } from "node:timers/promises";

type ImmediateHandle = ReturnType<typeof setImmediate>;

// Capture every scheduling surface when this application module initializes. Real applications and
// their dependencies commonly keep these references, so replacing only the current global function
// is not sufficient to control the work they schedule later.
const capturedGlobalSetImmediate = globalThis.setImmediate;
const capturedGlobalClearImmediate = globalThis.clearImmediate;
const capturedTimersSetImmediate = timersSetImmediate;
const capturedTimersPromisesSetImmediate = timersPromisesSetImmediate;
const capturedNextTick = process.nextTick.bind(process);

function callbackImmediate(schedule: typeof setImmediate): Promise<void> {
	return new Promise((resolve) => schedule(resolve));
}

function nextTick(): Promise<void> {
	return new Promise((resolve) => capturedNextTick(resolve));
}

function nestedImmediate(): Promise<void> {
	return new Promise((resolve) => {
		capturedGlobalSetImmediate(() => capturedTimersSetImmediate(resolve));
	});
}

function cancelledImmediate(): void {
	const handle = capturedGlobalSetImmediate(() => {
		throw new Error("A cancelled hostile-shell immediate ran");
	}) as ImmediateHandle;
	capturedGlobalClearImmediate(handle);
}

/** Exercise the scheduling shapes that can place React's flush after a staged-render boundary. */
export async function hostileYield(index: number): Promise<void> {
	await Promise.resolve();

	switch (index % 6) {
		case 0:
			await callbackImmediate(capturedGlobalSetImmediate);
			break;
		case 1:
			await callbackImmediate(capturedTimersSetImmediate);
			break;
		case 2:
			await capturedTimersPromisesSetImmediate();
			break;
		case 3:
			await nestedImmediate();
			break;
		case 4:
			cancelledImmediate();
			await callbackImmediate(capturedGlobalSetImmediate);
			break;
		default:
			await nextTick();
			await callbackImmediate(capturedTimersSetImmediate);
	}

	await new Promise<void>((resolve) => queueMicrotask(resolve));
}
