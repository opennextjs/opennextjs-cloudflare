import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { getUpdatedWebpackChunksFileContent } from "./get-updated-webpack-chunks-file-content.js";

/**
 * Fixes the webpack-runtime.js file by removing its webpack dynamic requires.
 */
export async function updateWebpackChunksFile(buildOpts: BuildOptions) {
  console.log("# updateWebpackChunksFile");

  const { outputDir } = buildOpts;

  const dotNextServerDir = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next/server"
  );

  const webpackRuntimeFile = join(dotNextServerDir, "webpack-runtime.js");

  const fileContent = readFileSync(webpackRuntimeFile, "utf-8");

  const chunks = readdirSync(join(dotNextServerDir, "chunks"))
    .filter((chunk) => /^\d+\.js$/.test(chunk))
    .map((chunk) => {
      console.log(` - chunk ${chunk}`);
      return chunk.replace(/\.js$/, "");
    });

  const updatedFileContent = await getUpdatedWebpackChunksFileContent(fileContent, chunks);

  writeFileSync(webpackRuntimeFile, updatedFileContent);
}
