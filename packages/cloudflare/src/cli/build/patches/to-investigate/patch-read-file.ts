import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { globSync } from "glob";

import { Config } from "../../../config";
import { normalizePath } from "../../utils";

export function patchBuildId(code: string, config: Config): string {
  // The next-server code gets the buildId from the filesystem, resulting in a `[unenv] fs.readFileSync is not implemented yet!` error
  // so we add an early return to the `getBuildId` function so that the `readyFileSync` is never encountered
  // (source: https://github.com/vercel/next.js/blob/15aeb92efb34c09a36/packages/next/src/server/next-server.ts#L438-L451)
  // Note: we could/should probably just patch readFileSync here or something!
  return code.replace(
    "getBuildId() {",
    `getBuildId() {
      return ${JSON.stringify(readFileSync(join(config.paths.output.standaloneAppDotNext, "BUILD_ID"), "utf-8"))};
    `
  );
}

export function patchLoadManifest(code: string, config: Config): string {
  // Same as patchBuildId, the next-server code loads the manifests with `readFileSync` and we want to avoid that
  // (source: https://github.com/vercel/next.js/blob/15aeb92e/packages/next/src/server/load-manifest.ts#L34-L56)
  // Note: we could/should probably just patch readFileSync here or something!
  const manifestJsons = globSync(
    normalizePath(join(config.paths.output.standaloneAppDotNext, "**", "*-manifest.json"))
  ).map((file) =>
    normalizePath(file).replace(normalizePath(config.paths.output.standaloneApp) + posix.sep, "")
  );
  return code.replace(
    /function loadManifest\((.+?), .+?\) {/,
    `$&
    ${manifestJsons
      .map(
        (manifestJson) => `
          if ($1.endsWith("${manifestJson}")) {
            return ${readFileSync(join(config.paths.output.standaloneApp, manifestJson), "utf-8")};
          }
        `
      )
      .join("\n")}
    throw new Error("Unknown loadManifest: " + $1);
    `
  );
}
