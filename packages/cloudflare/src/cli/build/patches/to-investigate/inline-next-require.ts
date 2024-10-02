import { existsSync, readFileSync } from "node:fs";
import { Config } from "../../../config";
import path from "node:path";

/**
 * The following avoid various Next.js specific files `require`d at runtime since we can just read
 * and inline their content during build time
 */
export function inlineNextRequire(code: string, config: Config) {
  console.log("# inlineNextRequire");
  const pagesManifestFile = path.join(config.paths.standaloneAppServer, "pages-manifest.json");
  const appPathsManifestFile = path.join(config.paths.standaloneAppServer, "app-paths-manifest.json");

  const pagesManifestFiles = existsSync(pagesManifestFile)
    ? Object.values(JSON.parse(readFileSync(pagesManifestFile, "utf-8"))).map(
        (file) => ".next/server/" + file
      )
    : [];
  const appPathsManifestFiles = existsSync(appPathsManifestFile)
    ? Object.values(JSON.parse(readFileSync(appPathsManifestFile, "utf-8"))).map(
        (file) => ".next/server/" + file
      )
    : [];
  const allManifestFiles = pagesManifestFiles.concat(appPathsManifestFiles);

  const htmlPages = allManifestFiles.filter((file) => file.endsWith(".html"));
  const pageModules = allManifestFiles.filter((file) => file.endsWith(".js"));

  return code.replace(
    /const pagePath = getPagePath\(.+?\);/,
    `$&
    ${htmlPages
      .map(
        (htmlPage) => `
          if (pagePath.endsWith("${htmlPage}")) {
            return ${JSON.stringify(readFileSync(path.join(config.paths.standaloneApp, htmlPage), "utf-8"))};
          }
        `
      )
      .join("\n")}
    ${pageModules
      .map(
        (module) => `
          if (pagePath.endsWith("${module}")) {
            return require("${path.join(config.paths.standaloneApp, module)}");
          }
        `
      )
      .join("\n")}
    throw new Error("Unknown pagePath: " + pagePath);
    `
  );
}
