import { readdirSync, statSync } from "node:fs";

import {
  build as buildAsync,
  type BuildOptions as ESBuildOptions,
} from "esbuild";

/**
 * Recursively traverse files in a directory and calls `callbackFn` on each file
 *
 * Note: this function is a simplified version of this: https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build/helper.ts#L147-L177
 *
 * @param root - Root directory to search
 * @param callbackFn - Called when for each file
 * @param searchingDir - Directory to search (used for recursion)
 */
export function traverseFiles(
  root: string,
  callbackFn: (filePath: string) => void,
  searchingDir: string = ""
) {
  readdirSync(`${root}/${searchingDir}`).forEach((file) => {
    const filePath = `${root}/${searchingDir}/${file}`;

    if (statSync(filePath).isDirectory()) {
      traverseFiles(root, callbackFn, `${searchingDir}/${file}`);
      return;
    }

    const relativeFilePath = `${searchingDir}/${file}`;
    callbackFn(relativeFilePath);
  });
}

/**
 * Simplified version of: https://github.com/sst/open-next/blob/f61b0e9486/packages/open-next/src/build/helper.ts#L94-L132
 *
 * @param esbuildOptions
 */
export async function esbuildAsync(esbuildOptions: ESBuildOptions) {
  const result = await buildAsync({
    target: "esnext",
    format: "esm",
    platform: "node",
    bundle: true,
    mainFields: ["module", "main"],
    sourcesContent: false,
    ...esbuildOptions,
    external: [...(esbuildOptions.external ?? []), "next"],
    banner: {
      ...esbuildOptions.banner,
      js: [esbuildOptions.banner?.js || ""].join(""),
    },
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    throw new Error(
      `There was a problem bundling ${
        (esbuildOptions.entryPoints as string[])[0]
      }.`
    );
  }
}
