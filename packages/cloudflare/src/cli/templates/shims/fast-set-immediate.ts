// Stub for Next.js's `node-environment-extensions/fast-set-immediate.external.js`.
//
// The original module monkey-patches `setImmediate` / `clearImmediate` onto the
// `node:timers` module to provide a custom scheduler used by Next's app-render
// pipeline. In Cloudflare Workers, `node:timers` is a frozen ESM module
// namespace under nodejs_compat, so `nodeTimers.setImmediate = ...` throws a
// "Cannot assign to read only property" TypeError, crashing every request.
//
// The fast-immediate scheduler is an optimization, not a correctness
// requirement: Next's rendering still works when the exported control
// functions are no-ops and `setImmediate` keeps its native (Workers) behavior.

// `DANGEROUSLY_runPendingImmediatesAfterCurrentTask` and
// `expectNoPendingImmediates` are called from app-render. Without the patch
// installed, there are no queued immediates to drain or assert against, so
// both reduce to no-ops in Workers.
export function DANGEROUSLY_runPendingImmediatesAfterCurrentTask(): void {}

export function expectNoPendingImmediates(): void {}

// Callers use this to access the native setImmediate before any patching.
// In Workers, no patching ever happens, so the global setImmediate IS the
// unpatched one.
export const unpatchedSetImmediate = (globalThis as unknown as { setImmediate: typeof setImmediate })
	.setImmediate;
