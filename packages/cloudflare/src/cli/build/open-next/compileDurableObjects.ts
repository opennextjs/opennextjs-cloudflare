import { createRequire } from "node:module";
import path from "node:path";

import { loadBuildId, loadPrerenderManifest } from "@opennextjs/aws/adapters/config/util.js";
import { type BuildOptions, esbuildSync } from "@opennextjs/aws/build/helper.js";

export function compileDurableObjects(buildOpts: BuildOptions) {
	const _require = createRequire(import.meta.url);
	const entryPoints = [
		_require.resolve("@opennextjs/cloudflare/durable-objects/queue"),
		_require.resolve("@opennextjs/cloudflare/durable-objects/sharded-tag-cache"),
		_require.resolve("@opennextjs/cloudflare/durable-objects/bucket-cache-purge"),
	];

	const buildOutputDotNextDir = path.join(buildOpts.appBuildOutputPath, ".next");

	const prerenderManifest = loadPrerenderManifest(buildOutputDotNextDir);
	const previewModeId = prerenderManifest.preview.previewModeId;
	const BUILD_ID = loadBuildId(buildOutputDotNextDir);

	return esbuildSync(
		{
			entryPoints,
			bundle: true,
			platform: "node",
			format: "esm",
			outdir: path.join(buildOpts.buildDir, "durable-objects"),
			external: ["cloudflare:workers"],
			define: {
				"process.env.__NEXT_PREVIEW_MODE_ID": `"${previewModeId}"`,
				"process.env.__NEXT_BUILD_ID": `"${BUILD_ID}"`,
			},
		},
		buildOpts
	);
}
