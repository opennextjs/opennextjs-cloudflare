/**
 * Standalone script to reproduce the OOM issue when populating R2 via unstable_startWorker.
 *
 * This mirrors the exact pattern used by populateR2IncrementalCache in populate-cache.ts:
 * - Starts a local worker with a remote R2 binding via unstable_startWorker
 * - Sends concurrent POST requests with FormData (key + value) to the worker
 * - The worker writes each entry to R2
 *
 * Memory usage is logged every 50 completed entries to detect leaks.
 *
 * Usage:
 *   pnpm build
 *   node --expose-gc packages/cloudflare/scripts/debug-r2-memory.mjs [bucket-name]
 *
 * bucket-name defaults to "cache".
 */

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unstable_startWorker } from "wrangler";

// --- Configuration ---

const TOTAL_ENTRIES = 10_000;
const CONCURRENCY = 1;
const VALUE = "0".repeat(50_000);
const MEMORY_LOG_INTERVAL = 50;

const bucketName = process.argv[2] ?? "cache";

// --- Memory tracking ---

/** @type {Array<{ entries: number; rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number; sysFree: number }>} */
const memorySnapshots = [];

/**
 * Forces a GC cycle (if --expose-gc was used) and records a memory snapshot.
 *
 * @param {number} entriesCompleted - Number of entries completed so far.
 */
function logMemory(entriesCompleted) {
	if (globalThis.gc) {
		globalThis.gc();
	}

	const mem = process.memoryUsage();
	const sysFree = os.freemem();
	const snapshot = {
		entries: entriesCompleted,
		rss: Math.round(mem.rss / 1024 / 1024),
		heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
		heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
		external: Math.round(mem.external / 1024 / 1024),
		arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024),
		sysFree: Math.round(sysFree / 1024 / 1024),
	};
	memorySnapshots.push(snapshot);

	console.log(
		`[${String(entriesCompleted).padStart(5)}/${TOTAL_ENTRIES}] ` +
			`RSS=${String(snapshot.rss).padStart(5)}MB  ` +
			`heap=${String(snapshot.heapUsed).padStart(5)}MB  ` +
			`external=${String(snapshot.external).padStart(5)}MB  ` +
			`arrayBuffers=${String(snapshot.arrayBuffers).padStart(5)}MB  ` +
			`sysFree=${String(snapshot.sysFree).padStart(6)}MB`
	);
}

/**
 * Prints a summary table of all memory snapshots.
 */
function printSummary() {
	console.log("\n=== Memory Summary ===\n");
	const header =
		"Entries".padStart(7) +
		"  " +
		"RSS(MB)".padStart(8) +
		"  " +
		"Heap(MB)".padStart(9) +
		"  " +
		"External(MB)".padStart(13) +
		"  " +
		"ArrBuf(MB)".padStart(11) +
		"  " +
		"SysFree(MB)".padStart(12);
	console.log(header);
	console.log("-".repeat(header.length));

	for (const s of memorySnapshots) {
		console.log(
			String(s.entries).padStart(7) +
				"  " +
				String(s.rss).padStart(8) +
				"  " +
				String(s.heapUsed).padStart(9) +
				"  " +
				String(s.external).padStart(13) +
				"  " +
				String(s.arrayBuffers).padStart(11) +
				"  " +
				String(s.sysFree).padStart(12)
		);
	}

	if (memorySnapshots.length >= 2) {
		const first = memorySnapshots[0];
		const last = memorySnapshots[memorySnapshots.length - 1];
		console.log("-".repeat(header.length));
		console.log(
			"Delta".padStart(7) +
				"  " +
				String(last.rss - first.rss).padStart(7) +
				"  " +
				String(last.heapUsed - first.heapUsed).padStart(8) +
				"  " +
				String(last.external - first.external).padStart(12) +
				"  " +
				String(last.arrayBuffers - first.arrayBuffers).padStart(10) +
				"  " +
				String(last.sysFree - first.sysFree).padStart(11)
		);
	}
}

// --- Send a single entry to the worker (mirrors sendEntryToR2Worker) ---

/**
 * Sends a single cache entry to the R2 worker via POST /populate with FormData.
 *
 * @param {string} workerUrl - The URL of the worker's /populate endpoint.
 * @param {string} key - The R2 object key.
 * @param {string} value - The value to store.
 * @throws {Error} If the worker reports a failure.
 */
async function sendEntry(workerUrl, key, value) {
	const formData = new FormData();
	formData.set("key", key);
	formData.set("value", value);

	const start = performance.now();
	const response = await fetch(workerUrl, {
		method: "POST",
		body: formData,
	});

	const result = await response.json();
	const elapsed = Math.round(performance.now() - start);
	console.log(`[request] ${key} ${elapsed}ms`);

	if (!result.success) {
		throw new Error(`Failed to write "${key}": ${result.error}`);
	}
}

// --- Main ---

async function main() {
	console.log(`Bucket:      ${bucketName}`);
	console.log(`Entries:     ${TOTAL_ENTRIES}`);
	console.log(`Concurrency: ${CONCURRENCY}`);
	console.log(`Value size:  ${VALUE.length} chars`);
	console.log(
		`System RAM:  ${Math.round(os.totalmem() / 1024 / 1024)}MB (${Math.round(os.freemem() / 1024 / 1024)}MB free)`
	);
	console.log(`GC exposed:  ${!!globalThis.gc}`);
	console.log();

	if (!globalThis.gc) {
		console.warn("WARNING: --expose-gc not set. Memory snapshots will be less accurate.\n");
	}

	// Resolve the worker entrypoint (the compiled r2-cache.js)
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const handlerPath = path.join(currentDir, "../dist/cli/workers/r2-cache.js");

	console.log(`Starting worker with remote R2 binding (bucket: ${bucketName})...`);

	const worker = await unstable_startWorker({
		name: "debug-r2-memory",
		entrypoint: handlerPath,
		compatibilityDate: "2026-01-01",
		bindings: {
			R2: {
				type: "r2_bucket",
				bucket_name: bucketName,
				remote: true,
			},
		},
		dev: {
			server: { port: 0 },
			inspector: false,
			watch: false,
			liveReload: false,
			logLevel: "debug",
		},
	});

	try {
		await worker.ready;
		const baseUrl = await worker.url;
		const workerUrl = new URL("/populate", baseUrl).href;

		console.log(`Worker ready at ${baseUrl}\n`);

		// Log initial memory before sending anything.
		logMemory(0);

		// Concurrency-limited send loop (mirrors sendEntriesToR2Worker).
		let completed = 0;
		const pending = new Set();

		for (let i = 0; i < TOTAL_ENTRIES; i++) {
			// If we've reached the concurrency limit, wait for one to finish.
			if (pending.size >= CONCURRENCY) {
				await Promise.race(pending);
			}

			const key = `key-${i}`;
			const task = sendEntry(workerUrl, key, VALUE)
				.then(() => {
					completed++;

					// Log memory every MEMORY_LOG_INTERVAL completed entries.
					if (completed % MEMORY_LOG_INTERVAL === 0) {
						logMemory(completed);
					}
				})
				.finally(() => pending.delete(task));
			pending.add(task);
		}

		// Wait for all remaining in-flight requests.
		await Promise.all(pending);

		// Final memory snapshot if not already logged at TOTAL_ENTRIES.
		if (completed % MEMORY_LOG_INTERVAL !== 0) {
			logMemory(completed);
		}

		console.log(`\nAll ${TOTAL_ENTRIES} entries written successfully.`);
		printSummary();
	} finally {
		await worker.dispose();
		console.log("\nWorker disposed.");
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
