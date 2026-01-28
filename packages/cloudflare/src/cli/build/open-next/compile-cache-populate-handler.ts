import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";

/**
 * Compiles the cache populate handler for the workerd runtime.
 * This handler allows the CLI to populate the R2 cache directly via the worker,
 * bypassing wrangler's rate-limited r2 bulk put command.
 */
export async function compileCachePopulateHandler(options: BuildOptions) {
	const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
	const templatesDir = path.join(currentDir, "../../templates");
	const handlerPath = path.join(templatesDir, "cache-populate-handler.js");

	await build({
		entryPoints: [handlerPath],
		outdir: path.join(options.outputDir, "cloudflare"),
		bundle: true,
		minify: false,
		format: "esm",
		target: "esnext",
		platform: "node",
	});
}
