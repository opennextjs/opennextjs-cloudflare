import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

/**
 * Sets up the OpenNext cache handler in a Next.js build.
 *
 * The cache handler used by Next.js is normally defined in the config file as a path. At runtime,
 * Next.js would then do a dynamic require on a transformed version of the path to retrieve the
 * cache handler and create a new instance of it.
 *
 * This is problematic in workerd due to the dynamic import of the file that is not known from
 * build-time. Therefore, we have to manually override the default way that the cache handler is
 * instantiated with a dynamic require that uses a string literal for the path.
 */
export async function patchCache(code: string, openNextOptions: BuildOptions): Promise<string> {
  console.log("# patchCache");

  const { appBuildOutputPath, outputDir, monorepoRoot } = openNextOptions;

  // TODO: switch to cache.mjs
  const outputPath = path.join(outputDir, "server-functions", "default");
  const packagePath = path.relative(monorepoRoot, appBuildOutputPath);
  const cacheFile = path.join(outputPath, packagePath, "cache.cjs");

  const patchedCode = code.replace(
    "const { cacheHandler } = this.nextConfig;",
    `const cacheHandler = null;
CacheHandler = require('${cacheFile}').default;
`
  );

  if (patchedCode === code) {
    throw new Error("Patch `patchCache` not applied");
  }

  return patchedCode;
}
