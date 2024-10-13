import { readFileSync, statSync, writeFileSync } from "node:fs";
import { Config } from "../../../config";
import { join } from "node:path";

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

  // Patch .next/standalone/node_modules/next/dist/server/lib/trace/tracer.js
  //
  // Remove the need for an alias in wrangler.toml:
  //
  // [alias]
  // # @opentelemetry/api is `require`d when running wrangler dev, so we need to stub it out
  // # IMPORTANT: we shim @opentelemetry/api to the throwing shim so that it will throw right away, this is so that we throw inside the
  // #            try block here: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31
  // #            causing the code to require the 'next/dist/compiled/@opentelemetry/api' module instead (which properly works)
  // #"@opentelemetry/api" = "./.next/standalone/node_modules/cf/templates/shims/throw.ts"
  const tracerFile = join(distPath, "server", "lib", "trace", "tracer.js");

  const patchedTracer = readFileSync(tracerFile, "utf-8").replaceAll(
    /\w+\s*=\s*require\([^/]*opentelemetry.*\)/g,
    `throw new Error("@opentelemetry/api")`
  );

  writeFileSync(tracerFile, patchedTracer);
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
  for (const root of [config.paths.standaloneApp, config.paths.standaloneRoot]) {
    try {
      const distPath = join(root, "node_modules", "next", "dist");
      if (statSync(distPath).isDirectory()) return distPath;
    } catch {
      /* empty */
    }
  }

  throw new Error("Unexpected error: unable to detect the node_modules/next/dist directory");
}
