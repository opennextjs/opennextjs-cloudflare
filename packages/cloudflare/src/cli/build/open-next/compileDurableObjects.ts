import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { type BuildOptions, esbuildSync, getPackagePath } from "@opennextjs/aws/build/helper.js";

export function compileDurableObjects(buildOpts: BuildOptions) {
  const _require = createRequire(import.meta.url);
  const entryPoints = [_require.resolve("@opennextjs/cloudflare/durable-objects/queue")];

  const { outputDir } = buildOpts;

  const baseManifestPath = path.join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next"
  );

  // TODO: Reuse the manifest
  const prerenderManifest = path.join(baseManifestPath, "prerender-manifest.json");
  const prerenderManifestContent = fs.readFileSync(prerenderManifest, "utf-8");
  const prerenderManifestJson = JSON.parse(prerenderManifestContent);
  const previewModeId = prerenderManifestJson.preview.previewModeId;

  const BUILD_ID = fs.readFileSync(path.join(baseManifestPath, "BUILD_ID"), "utf-8");

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
