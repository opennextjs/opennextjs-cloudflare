import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { type BuildOptions, getBuildId, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { globSync } from "glob";

import { normalizePath } from "../../utils/index.js";

export function patchBuildId(code: string, buildOpts: BuildOptions): string {
  // The Next code gets the buildId from the filesystem so we hardcode the value at build time.
  return code.replace(
    "getBuildId() {",
    `getBuildId() {
      return ${JSON.stringify(getBuildId(buildOpts))};
    `
  );
}

export function patchLoadManifest(code: string, buildOpts: BuildOptions): string {
  // Inline manifest that Next would otherwise retrieve from the file system.

  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
  const dotNextDir = join(baseDir, ".next");

  const manifests = globSync(join(dotNextDir, "**/*-manifest.json"));

  return code.replace(
    /function loadManifest\((.+?), .+?\) {/,
    `$&
    ${manifests
      .map(
        (manifest) => `
          if ($1.endsWith("${normalizePath("/" + relative(dotNextDir, manifest))}")) {
            return ${readFileSync(manifest, "utf-8")};
          }
        `
      )
      .join("\n")}
    throw new Error("Unknown loadManifest: " + $1);
    `
  );
}
