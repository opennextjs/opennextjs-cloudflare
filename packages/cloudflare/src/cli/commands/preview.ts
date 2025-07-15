import { BuildOptions } from "@opennextjs/aws/build/helper.js";

import type { OpenNextConfig } from "../../api/config.js";
import { getWranglerConfigFlag, getWranglerEnvironmentFlag, runWrangler } from "../utils/run-wrangler.js";
import { populateCache } from "./populate-cache.js";

export async function preview(
	options: BuildOptions,
	config: OpenNextConfig,
	previewOptions: { passthroughArgs: string[]; cacheChunkSize?: number }
) {
	await populateCache(options, config, {
		target: "local",
		environment: getWranglerEnvironmentFlag(previewOptions.passthroughArgs),
		config: getWranglerConfigFlag(previewOptions.passthroughArgs),
		cacheChunkSize: previewOptions.cacheChunkSize,
	});

	runWrangler(options, ["dev", ...previewOptions.passthroughArgs], { logging: "all" });
}
