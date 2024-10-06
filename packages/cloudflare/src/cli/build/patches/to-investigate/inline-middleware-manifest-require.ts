import { existsSync, readFileSync } from "node:fs";
import { Config } from "../../../config";
import path from "node:path";

/**
 * Inlines the middleware manifest from the build output to prevent a dynamic require statement
 * as they result in runtime failures.
 */
export function inlineMiddlewareManifestRequire(code: string, config: Config) {
  console.log("# inlineMiddlewareManifestRequire");

  const middlewareManifestPath = path.join(config.paths.standaloneAppServer, "middleware-manifest.json");

  const middlewareManifest = existsSync(middlewareManifestPath)
    ? JSON.parse(readFileSync(middlewareManifestPath, "utf-8"))
    : {};

  return code.replace(/require\(this.middlewareManifestPath\)/, JSON.stringify(middlewareManifest));
}
