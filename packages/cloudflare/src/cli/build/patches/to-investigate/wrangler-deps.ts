import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Config } from "../../../config.js";

export function patchWranglerDeps(config: Config) {
  console.log("# patchWranglerDeps");

  const distPath = getDistPath(config);
  // Patch .next/standalone/node_modules/next/dist/compiled/next-server/pages.runtime.prod.js
  //
  // Remove the need for an alias in wrangler.toml:
  //
  // [alias]
  // # critters is `require`d from `pages.runtime.prod.js` when running wrangler dev, so we need to stub it out
  // "critters" = "./.next/standalone/node_modules/cf/templates/shims/empty.ts"
  const pagesRuntimeFile = join(distPath, "compiled", "next-server", "pages.runtime.prod.js");

  const patchedPagesRuntime = readFileSync(pagesRuntimeFile, "utf-8").replace(
    `e.exports=require("critters")`,
    `e.exports={}`
  );

  writeFileSync(pagesRuntimeFile, patchedPagesRuntime);

  patchTracerFile(join(distPath, "server", "lib", "trace", "tracer.js"));
}

/**
 * Next.js saves the node_modules/next/dist directory in either the standaloneApp path or in the
 * standaloneRoot path, this depends on where the next dependency is actually saved (
 * https://github.com/vercel/next.js/blob/39e06c75/packages/next/src/build/webpack-config.ts#L103-L104
 * ) and can depend on the package manager used, if it is using workspaces, etc...
 *
 * This function checks the two potential paths for the dist directory and returns the first that it finds,
 * it throws an error if it can't find either
 *
 * @param config
 * @returns the node_modules/next/dist directory path
 */
function getDistPath(config: Config): string {
  for (const root of [config.paths.output.standaloneApp, config.paths.output.standaloneRoot]) {
    try {
      const distPath = join(root, "node_modules", "next", "dist");
      if (statSync(distPath).isDirectory()) return distPath;
    } catch {
      /* empty */
    }
  }

  throw new Error("Unexpected error: unable to detect the node_modules/next/dist directory");
}

/**
 * Patch trace/tracer.js files that require from `@opentelemetry/api` by replacing such `require`
 * calls with error throwing expressions.
 *
 * The replacement works because code that requires from `@opentelementry/api` is `try-catch`ed
 * and a supported alternative is imported in the catch blocks
 * (see: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31)
 *
 * @param tracerFilePath path to the tracer file to patch
 */
export function patchTracerFile(tracerFilePath: string) {
  const tracerFileContent = readFileSync(tracerFilePath, "utf-8");
  const patchedTracerFileContent = tracerFileContent.replaceAll(
    /\w+\s*=\s*require\([^/]*opentelemetry.*\)/g,
    `throw new Error("@opentelemetry/api")`
  );

  if (patchedTracerFileContent === tracerFileContent) {
    throw new Error(`Failed to patch tracer file at ${tracerFilePath}`);
  }

  writeFileSync(tracerFilePath, patchedTracerFileContent);
}
