import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";

/**
 * Compiles the initialization code for the workerd runtime
 */
export async function compileImages(options: BuildOptions) {
  const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
  const templatesDir = path.join(currentDir, "../../templates");
  const imagesPath = path.join(templatesDir, "images.js");

  const imagesManifestPath = path.join(options.appBuildOutputPath, ".next/images-manifest.json");
  const imagesManifest = fs.existsSync(imagesManifestPath)
    ? JSON.parse(fs.readFileSync(imagesManifestPath, { encoding: "utf-8" }))
    : {};

  await build({
    entryPoints: [imagesPath],
    outdir: path.join(options.outputDir, "cloudflare"),
    bundle: false,
    minify: false,
    format: "esm",
    target: "esnext",
    platform: "node",
    define: {
      __IMAGES_REMOTE_PATTERNS__: JSON.stringify(imagesManifest?.images?.remotePatterns ?? []),
      __IMAGES_LOCAL_PATTERNS__: JSON.stringify(imagesManifest?.images?.localPatterns ?? []),
    },
  });
}
