import { readFileSync } from "node:fs";
import { globSync } from "glob";
import { NextjsAppPaths } from "../../../nextjs-paths";

export function patchReadFile(code: string, nextjsAppPaths: NextjsAppPaths): string {
  console.log("# patchReadFile");
  // The next-server code gets the buildId from the filesystem, resulting in a `[unenv] fs.readFileSync is not implemented yet!` error
  // so we add an early return to the `getBuildId` function so that the `readyFileSync` is never encountered
  // (source: https://github.com/vercel/next.js/blob/15aeb92efb34c09a36/packages/next/src/server/next-server.ts#L438-L451)
  // Note: we could/should probably just patch readFileSync here or something!
  code = code.replace(
    "getBuildId() {",
    `getBuildId() {
      return ${JSON.stringify(readFileSync(`${nextjsAppPaths.standaloneAppDotNextDir}/BUILD_ID`, "utf-8"))};
    `
  );

  // Same as above, the next-server code loads the manifests with `readyFileSync` and we want to avoid that
  // (source: https://github.com/vercel/next.js/blob/15aeb92e/packages/next/src/server/load-manifest.ts#L34-L56)
  // Note: we could/should probably just patch readFileSync here or something!
  const manifestJsons = globSync(`${nextjsAppPaths.standaloneAppDotNextDir}/**/*-manifest.json`).map((file) =>
    file.replace(nextjsAppPaths.standaloneAppDir + "/", "")
  );
  code = code.replace(
    /function loadManifest\((.+?), .+?\) {/,
    `$&
    ${manifestJsons
      .map(
        (manifestJson) => `
          if ($1.endsWith("${manifestJson}")) {
            return ${readFileSync(`${nextjsAppPaths.standaloneAppDir}/${manifestJson}`, "utf-8")};
          }
        `
      )
      .join("\n")}
    throw new Error("Unknown loadManifest: " + $1);
    `
  );

  return code;
}
