/**
 * Worker thread entry point for `apply-code-patches.ts`.
 *
 * Rebuilds the code patches from the static list in `code-patches.js` (functions can not cross
 * the thread boundary) and patches the files received from the pool, one at a time.
 */
import { parentPort, workerData } from "node:worker_threads";

import logger from "@opennextjs/aws/logger.js";

import type { PatchWorkerData, PatchWorkerRequest, PatchWorkerResponse } from "./code-patches.js";
import { getCodePatchers, getPatchesForVersion, patchFile } from "./code-patches.js";

if (parentPort === null) {
	throw new Error("This module must run in a worker thread");
}
const port = parentPort;

const { buildOptions, tracedFiles, manifests } = workerData as PatchWorkerData;

logger.setLevel(buildOptions.debug ? "debug" : "info");

const patches = getPatchesForVersion(getCodePatchers(buildOptions), buildOptions.nextVersion);

port.on("message", (filePath: PatchWorkerRequest) => {
	if (filePath === null) {
		port.close();
		return;
	}
	void patchFile(filePath, patches, { buildOptions, tracedFiles, manifests })
		.then(() => port.postMessage({ filePath } satisfies PatchWorkerResponse))
		.catch((error: unknown) =>
			port.postMessage({
				filePath,
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
			} satisfies PatchWorkerResponse)
		);
});
