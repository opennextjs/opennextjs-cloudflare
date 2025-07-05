import { BuildOptions } from "@opennextjs/aws/build/helper.js";

import type { OpenNextConfig } from "../../api/config.js";
import { getWranglerConfigFlag, getWranglerEnvironmentFlag, runWrangler } from "../utils/run-wrangler.js";
import { populateCache } from "./populate-cache.js";

export async function upload(
	options: BuildOptions,
	config: OpenNextConfig,
	uploadOptions: { passthroughArgs: string[]; cacheChunkSize?: number }
) {
	await populateCache(options, config, {
		target: "remote",
		environment: getWranglerEnvironmentFlag(uploadOptions.passthroughArgs),
		config: getWranglerConfigFlag(uploadOptions.passthroughArgs),
		cacheChunkSize: uploadOptions.cacheChunkSize,
	});

	runWrangler(options, ["versions upload", ...uploadOptions.passthroughArgs], { logging: "all" });
}
