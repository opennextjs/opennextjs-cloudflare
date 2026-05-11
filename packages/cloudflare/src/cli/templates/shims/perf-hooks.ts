// Stub for Node.js `perf_hooks` / `node:perf_hooks` in Cloudflare Workers.
//
// Workers expose `performance` natively via the Web Performance API.
// GC observation via PerformanceObserver with entryTypes ['gc'] is Node.js-specific
// and is a no-op in the Workers environment.

// Workers expose performance via the Web API; cast because workers-types may not declare it on globalThis
export const performance = (globalThis as unknown as { performance: unknown }).performance;

export class PerformanceObserver {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_callback: unknown) {}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	observe(_options?: unknown): void {}
	disconnect(): void {}
	takeRecords(): unknown[] {
		return [];
	}
}
