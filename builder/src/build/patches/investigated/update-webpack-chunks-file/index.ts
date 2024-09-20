import { readdirSync, readFileSync, writeFileSync } from "node:fs";

import { NextjsAppPaths } from "../../../../nextjs-paths";
import { getUpdatedWebpackChunksFileContent } from "./get-updated-webpack-chunks-file-content";

/**
 * Fixes the webpack-runtime.js file by removing its webpack dynamic requires.
 *
 * This hack is particularly bad as it indicates that files inside the output directory still get a hold of files from the outside: `${nextjsAppPaths.standaloneAppServerDir}/webpack-runtime.js`
 *    so this shows that not everything that's needed to deploy the application is in the output directory...
 */
export async function updateWebpackChunksFile(nextjsAppPaths: NextjsAppPaths) {
  console.log("# updateWebpackChunksFile");
  const webpackRuntimeFile = `${nextjsAppPaths.standaloneAppServerDir}/webpack-runtime.js`;

  const fileContent = readFileSync(webpackRuntimeFile, "utf-8");

  const chunks = readdirSync(`${nextjsAppPaths.standaloneAppServerDir}/chunks`)
    .filter((chunk) => /^\d+\.js$/.test(chunk))
    .map((chunk) => {
      console.log(` - chunk ${chunk}`);
      return chunk.replace(/\.js$/, "");
    });

  const updatedFileContent = await getUpdatedWebpackChunksFileContent(fileContent, chunks);

  writeFileSync(webpackRuntimeFile, updatedFileContent);
}
