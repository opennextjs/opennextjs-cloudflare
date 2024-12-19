import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Config } from "../../../../config.js";
import { getUpdatedWebpackChunksFileContent } from "./get-updated-webpack-chunks-file-content.js";

/**
 * Fixes the webpack-runtime.js file by removing its webpack dynamic requires.
 *
 * This hack is particularly bad as it indicates that files inside the output directory still get a hold of files from the outside: `${nextjsAppPaths.standaloneAppServerDir}/webpack-runtime.js`
 *    so this shows that not everything that's needed to deploy the application is in the output directory...
 */
export async function updateWebpackChunksFile(config: Config) {
  console.log("# updateWebpackChunksFile");
  const webpackRuntimeFile = join(config.paths.output.standaloneAppServer, "webpack-runtime.js");

  const fileContent = readFileSync(webpackRuntimeFile, "utf-8");

  const chunks = readdirSync(join(config.paths.output.standaloneAppServer, "chunks"))
    .filter((chunk) => /^\d+\.js$/.test(chunk))
    .map((chunk) => {
      console.log(` - chunk ${chunk}`);
      return chunk.replace(/\.js$/, "");
    });

  const updatedFileContent = await getUpdatedWebpackChunksFileContent(fileContent, chunks);

  writeFileSync(webpackRuntimeFile, updatedFileContent);
}
