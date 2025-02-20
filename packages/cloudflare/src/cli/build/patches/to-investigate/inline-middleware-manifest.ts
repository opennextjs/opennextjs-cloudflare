import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

/**
 * Inlines the middleware manifest from the build output to prevent a dynamic require statement
 * as they result in runtime failures.
 */
export function inlineMiddlewareManifestRequire(code: string, buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const middlewareManifestPath = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next/server/middleware-manifest.json"
  );

  const middlewareManifest = existsSync(middlewareManifestPath)
    ? JSON.parse(readFileSync(middlewareManifestPath, "utf-8"))
    : {};

  return code.replace("require(this.middlewareManifestPath)", JSON.stringify(middlewareManifest));
}
