import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";
import type { Unstable_Config } from "wrangler";

/**
 * Compiles the initialization code for the workerd runtime
 */
export async function compileInit(options: BuildOptions, wranglerConfig: Unstable_Config) {
	const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
	const templatesDir = path.join(currentDir, "../../templates");
	const initPath = path.join(templatesDir, "init.js");

	const nextConfig = loadConfig(path.join(options.appBuildOutputPath, ".next"));
	const basePath = nextConfig.basePath ?? "";
	const deploymentId = nextConfig.deploymentId ?? "";

	await build({
		entryPoints: [initPath],
		outdir: path.join(options.outputDir, "cloudflare"),
		bundle: false,
		minify: false,
		format: "esm",
		target: "esnext",
		platform: "node",
		define: {
			__BUILD_TIMESTAMP_MS__: JSON.stringify(Date.now()),
			__NEXT_BASE_PATH__: JSON.stringify(basePath),
			__ASSETS_RUN_WORKER_FIRST__: JSON.stringify(wranglerConfig.assets?.run_worker_first ?? false),
			__DEPLOYMENT_ID__: JSON.stringify(deploymentId),
		},
	});
}
