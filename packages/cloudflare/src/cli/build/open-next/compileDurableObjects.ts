import { createRequire } from "node:module";
import path from "node:path";

import { loadBuildId, loadPrerenderManifest } from "@opennextjs/aws/adapters/config/util.js";
import { type BuildOptions, esbuildSync, getPackagePath } from "@opennextjs/aws/build/helper.js";

export function compileDurableObjects(buildOpts: BuildOptions) {
  const _require = createRequire(import.meta.url);
  const entryPoints = [
    _require.resolve("@opennextjs/cloudflare/durable-objects/queue"),
    _require.resolve("@opennextjs/cloudflare/durable-objects/sharded-tag-cache"),
  ];

  const { outputDir } = buildOpts;

  const baseManifestPath = path.join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next"
  );

  // We need to change the type in aws
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prerenderManifest = loadPrerenderManifest(baseManifestPath) as any;
  const previewModeId = prerenderManifest.preview.previewModeId;

  const BUILD_ID = loadBuildId(baseManifestPath);

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
