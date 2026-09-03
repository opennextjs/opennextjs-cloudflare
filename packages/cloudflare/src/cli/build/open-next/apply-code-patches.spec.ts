import os from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
	enqueuePatching,
	getMaxWorkers,
	type PoolWorker,
	runWorkerPool,
	splitPoolFiles,
} from "./apply-code-patches.js";
import type { PatchWorkerRequest, PatchWorkerResponse } from "./code-patches.js";

type Listener = (...args: never[]) => void;

class FakeWorker implements PoolWorker {
	terminated = false;
	private listeners = new Map<string, Listener[]>();

	constructor(private handler: (filePath: string) => Promise<void>) {}

	exited = false;

	postMessage(message: PatchWorkerRequest): void {
		if (message === null) {
			setTimeout(() => {
				this.exited = true;
				this.emit("exit", 0);
			}, 1);
			return;
		}
		void this.handler(message)
			.then(() => this.emit("message", { filePath: message }))
			.catch((error: unknown) => this.emit("message", { filePath: message, error: String(error) }));
	}

	on(event: "message", listener: (message: PatchWorkerResponse) => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	on(event: "exit", listener: (code: number) => void): this;
	on(event: string, listener: Listener): this {
		this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
		return this;
	}

	emit(event: string, arg: unknown): void {
		for (const listener of this.listeners.get(event) ?? []) {
			(listener as (arg: unknown) => void)(arg);
		}
	}

	async terminate(): Promise<number> {
		this.terminated = true;
		return 1;
	}
}

describe("runWorkerPool", () => {
	it("patches every file exactly once using at most poolSize workers", async () => {
		const files = ["/a.js", "/b.js", "/c.js", "/d.js", "/e.js"];
		const patched: string[] = [];
		const workers: FakeWorker[] = [];
		const createWorker = () => {
			const worker = new FakeWorker(async (filePath) => {
				patched.push(filePath);
			});
			workers.push(worker);
			return worker;
		};

		await runWorkerPool(files, 2, createWorker);

		expect(workers).toHaveLength(2);
		expect(patched.toSorted()).toEqual(files.toSorted());
	});

	it("does not create more workers than files", async () => {
		const workers: FakeWorker[] = [];
		const createWorker = () => {
			const worker = new FakeWorker(async () => {});
			workers.push(worker);
			return worker;
		};

		await runWorkerPool(["/a.js"], 8, createWorker);

		expect(workers).toHaveLength(1);
	});

	it("rejects when a worker fails to patch a file", async () => {
		const workers: FakeWorker[] = [];
		const createWorker = () => {
			const worker = new FakeWorker(async (filePath) => {
				if (filePath === "/b.js") {
					throw new Error("patch failed");
				}
			});
			workers.push(worker);
			return worker;
		};

		await expect(runWorkerPool(["/a.js", "/b.js", "/c.js"], 2, createWorker)).rejects.toThrow(
			/\/b\.js.*patch failed/s
		);
		expect(workers.every((worker) => worker.terminated)).toBe(true);
	});

	it("resolves only after every worker exited", async () => {
		const workers: FakeWorker[] = [];
		const createWorker = () => {
			const worker = new FakeWorker(async () => {});
			workers.push(worker);
			return worker;
		};

		await runWorkerPool(["/a.js", "/b.js", "/c.js"], 2, createWorker);

		expect(workers.every((worker) => worker.exited)).toBe(true);
	});

	it("terminates the created workers when creating another worker fails", async () => {
		const workers: FakeWorker[] = [];
		const createWorker = () => {
			if (workers.length === 1) {
				throw new Error("worker creation failed");
			}
			const worker = new FakeWorker(async () => {});
			workers.push(worker);
			return worker;
		};

		await expect(runWorkerPool(["/a.js", "/b.js"], 2, createWorker)).rejects.toThrow(
			"worker creation failed"
		);
		expect(workers).toHaveLength(1);
		expect(workers[0]?.terminated).toBe(true);
	});

	it("rejects when a worker crashes", async () => {
		const createWorker = () => {
			const worker = new FakeWorker(async () => {
				worker.emit("error", new Error("worker crashed"));
			});
			return worker;
		};

		await expect(runWorkerPool(["/a.js"], 1, createWorker)).rejects.toThrow("worker crashed");
	});
});

describe("enqueuePatching", () => {
	it("does not overlap two patching runs", async () => {
		const events: string[] = [];
		const first = enqueuePatching(async () => {
			events.push("first start");
			await new Promise((resolve) => setTimeout(resolve, 20));
			events.push("first end");
			return 1;
		});
		const second = enqueuePatching(async () => {
			events.push("second start");
			return 2;
		});

		await expect(first).resolves.toEqual(1);
		await expect(second).resolves.toEqual(2);
		expect(events).toEqual(["first start", "first end", "second start"]);
	});

	it("runs the next run after a failed one", async () => {
		const failed = enqueuePatching(async () => {
			throw new Error("patching failed");
		});
		const next = enqueuePatching(async () => "ok");

		await expect(failed).rejects.toThrow("patching failed");
		await expect(next).resolves.toEqual("ok");
	});
});

describe("splitPoolFiles", () => {
	it("keeps the Turbopack runtime out of the pool", () => {
		const files = [
			"/out/.next/server/chunks/ssr/[turbopack]_runtime.js",
			"/out/.next/server/chunks/ssr/page.js",
			"/out/node_modules/next/dist/server/next-server.js",
		];

		expect(splitPoolFiles(files)).toEqual({
			poolFiles: [
				"/out/.next/server/chunks/ssr/page.js",
				"/out/node_modules/next/dist/server/next-server.js",
			],
			serialFiles: ["/out/.next/server/chunks/ssr/[turbopack]_runtime.js"],
		});
	});
});

describe("getMaxWorkers", () => {
	afterEach(() => {
		delete process.env.OPEN_NEXT_PATCH_WORKERS;
	});

	it("defaults to the available parallelism", () => {
		expect(getMaxWorkers()).toEqual(os.availableParallelism());
	});

	it("uses OPEN_NEXT_PATCH_WORKERS when it is a number", () => {
		process.env.OPEN_NEXT_PATCH_WORKERS = "3";
		expect(getMaxWorkers()).toEqual(3);
		process.env.OPEN_NEXT_PATCH_WORKERS = "0";
		expect(getMaxWorkers()).toEqual(0);
	});

	it("ignores OPEN_NEXT_PATCH_WORKERS when it is not a number", () => {
		process.env.OPEN_NEXT_PATCH_WORKERS = "2abc";
		expect(getMaxWorkers()).toEqual(os.availableParallelism());
		process.env.OPEN_NEXT_PATCH_WORKERS = "-1";
		expect(getMaxWorkers()).toEqual(os.availableParallelism());
	});
});
