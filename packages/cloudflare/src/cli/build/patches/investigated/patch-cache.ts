import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { normalizePath } from "../../utils/index.js";

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
export async function patchCache(code: string, buildOpts: BuildOptions): Promise<string> {
  const { outputDir } = buildOpts;

  // TODO: switch to cache.mjs
  const outputPath = path.join(outputDir, "server-functions/default");
  const cacheFile = path.join(outputPath, getPackagePath(buildOpts), "cache.cjs");

  return code.replace(
    "const { cacheHandler } = this.nextConfig;",
    `
const cacheHandler = null;
CacheHandler = require('${normalizePath(cacheFile)}').default;
`
  );
}

export async function patchComposableCache(code: string, buildOpts: BuildOptions): Promise<string> {
  const { outputDir } = buildOpts;

  // TODO: switch to mjs
  const outputPath = path.join(outputDir, "server-functions/default");
  const cacheFile = path.join(outputPath, getPackagePath(buildOpts), "composable-cache.cjs");
  //TODO: Do we want to move this to the new CodePatcher ?
  return code.replace(
    "const { cacheHandlers } = this.nextConfig.experimental",
    `
const cacheHandlers = null;
const handlersSymbol = Symbol.for('@next/cache-handlers');
const handlersMapSymbol = Symbol.for('@next/cache-handlers-map');
const handlersSetSymbol = Symbol.for('@next/cache-handlers-set');
globalThis[handlersMapSymbol] = new Map();
globalThis[handlersMapSymbol].set("default", require('${normalizePath(cacheFile)}').default);
globalThis[handlersSetSymbol] = new Set(globalThis[handlersMapSymbol].values());
`
  );
}
