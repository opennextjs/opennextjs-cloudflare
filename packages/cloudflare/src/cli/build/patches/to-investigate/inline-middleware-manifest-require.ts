import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Config } from "../../../config.js";

/**
 * Inlines the middleware manifest from the build output to prevent a dynamic require statement
 * as they result in runtime failures.
 */
export function inlineMiddlewareManifestRequire(code: string, config: Config) {
  const middlewareManifestPath = join(config.paths.output.standaloneAppServer, "middleware-manifest.json");

  const middlewareManifest = existsSync(middlewareManifestPath)
    ? JSON.parse(readFileSync(middlewareManifestPath, "utf-8"))
    : {};

  return code.replace("require(this.middlewareManifestPath)", JSON.stringify(middlewareManifest));
}
