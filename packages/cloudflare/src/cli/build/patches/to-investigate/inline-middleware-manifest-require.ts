import { existsSync, readFileSync } from "node:fs";
import { Config } from "../../../config";
import { join } from "node:path";

/**
 * Inlines the middleware manifest from the build output to prevent a dynamic require statement
 * as they result in runtime failures.
 */
export function inlineMiddlewareManifestRequire(code: string, config: Config) {
  console.log("# inlineMiddlewareManifestRequire");

  const middlewareManifestPath = join(config.paths.standaloneAppServer, "middleware-manifest.json");

  const middlewareManifest = existsSync(middlewareManifestPath)
    ? JSON.parse(readFileSync(middlewareManifestPath, "utf-8"))
    : {};

  const patchedCode = code.replace(
    "require(this.middlewareManifestPath)",
    JSON.stringify(middlewareManifest)
  );

  if (patchedCode === code) {
    throw new Error("Patch `inlineMiddlewareManifestRequire` not applied");
  }

  return patchedCode;
}
