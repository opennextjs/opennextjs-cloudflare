import { Config } from "../../../config";
import { globSync } from "glob";
import path from "node:path";
import { readFileSync } from "node:fs";

export function patchReadFile(code: string, config: Config): string {
  console.log("# patchReadFile");
  // The next-server code gets the buildId from the filesystem, resulting in a `[unenv] fs.readFileSync is not implemented yet!` error
  // so we add an early return to the `getBuildId` function so that the `readyFileSync` is never encountered
  // (source: https://github.com/vercel/next.js/blob/15aeb92efb34c09a36/packages/next/src/server/next-server.ts#L438-L451)
  // Note: we could/should probably just patch readFileSync here or something!
  code = code.replace(
    "getBuildId() {",
    `getBuildId() {
      return ${JSON.stringify(readFileSync(path.join(config.paths.standaloneAppDotNext, "BUILD_ID"), "utf-8"))};
    `
  );

  // Same as above, the next-server code loads the manifests with `readyFileSync` and we want to avoid that
  // (source: https://github.com/vercel/next.js/blob/15aeb92e/packages/next/src/server/load-manifest.ts#L34-L56)
  // Note: we could/should probably just patch readFileSync here or something!
  const manifestJsons = globSync(path.join(config.paths.standaloneAppDotNext, "**", "*-manifest.json")).map(
    (file) => file.replace(config.paths.standaloneApp + "/", "")
  );
  code = code.replace(
    /function loadManifest\((.+?), .+?\) {/,
    `$&
    ${manifestJsons
      .map(
        (manifestJson) => `
          if ($1.endsWith("${manifestJson}")) {
            return ${readFileSync(path.join(config.paths.standaloneApp, manifestJson), "utf-8")};
          }
        `
      )
      .join("\n")}
    throw new Error("Unknown loadManifest: " + $1);
    `
  );

  return code;
}
