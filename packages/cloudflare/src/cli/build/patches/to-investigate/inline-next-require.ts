import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

/**
 * The following avoid various Next.js specific files `require`d at runtime since we can just read
 * and inline their content during build time
 */
// TODO(vicb): __NEXT_PRIVATE_RUNTIME_TYPE is not handled by this patch
export function inlineNextRequire(code: string, buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;
  const serverDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");

  const pagesManifestFile = join(serverDir, "pages-manifest.json");
  const appPathsManifestFile = join(serverDir, "app-paths-manifest.json");

  const pagesManifests: string[] = existsSync(pagesManifestFile)
    ? Object.values(JSON.parse(readFileSync(pagesManifestFile, "utf-8")))
    : [];
  const appPathsManifests: string[] = existsSync(appPathsManifestFile)
    ? Object.values(JSON.parse(readFileSync(appPathsManifestFile, "utf-8")))
    : [];
  const manifests = pagesManifests.concat(appPathsManifests);

  const htmlPages = manifests.filter((file) => file.endsWith(".html"));
  const pageModules = manifests.filter((file) => file.endsWith(".js"));

  return code.replace(
    /const pagePath = getPagePath\(.+?\);/,
    `$&
    ${htmlPages
      .map(
        (htmlPage) => `
          if (pagePath.endsWith("${htmlPage}")) {
            return ${JSON.stringify(readFileSync(join(serverDir, htmlPage), "utf-8"))};
          }
        `
      )
      .join("\n")}
    ${pageModules
      .map(
        (module) => `
          if (pagePath.endsWith("${module}")) {
            return require(${JSON.stringify(join(serverDir, module))});
          }
        `
      )
      .join("\n")}
    throw new Error("Unknown pagePath: " + pagePath);
    `
  );
}
