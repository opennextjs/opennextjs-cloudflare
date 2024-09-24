import path from "node:path";
import fs, { writeFileSync } from "node:fs";
import { Config } from "../../../config";

export function patchWranglerDeps(config: Config) {
  console.log("# patchWranglerDeps");

  // Patch .next/standalone/node_modules/next/dist/compiled/next-server/pages.runtime.prod.js
  //
  // Remove the need for an alias in wrangler.toml:
  //
  // [alias]
  // # critters is `require`d from `pages.runtime.prod.js` when running wrangler dev, so we need to stub it out
  // "critters" = "./.next/standalone/node_modules/cf/templates/shims/empty.ts"
  const pagesRuntimeFile = path.join(
    config.paths.standaloneApp,
    "node_modules",
    "next",
    "dist",
    "compiled",
    "next-server",
    "pages.runtime.prod.js"
  );

  const patchedPagesRuntime = fs
    .readFileSync(pagesRuntimeFile, "utf-8")
    .replace(`e.exports=require("critters")`, `e.exports={}`);

  fs.writeFileSync(pagesRuntimeFile, patchedPagesRuntime);

  // Patch .next/standalone/node_modules/next/dist/server/lib/trace/tracer.js
  //
  // Remove the need for an alias in wrangler.toml:
  //
  // [alias]
  // # @opentelemetry/api is `require`d when running wrangler dev, so we need to stub it out
  // # IMPORTANT: we shim @opentelemetry/api to the throwing shim so that it will throw right away, this is so that we throw inside the
  // #            try block here: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31
  // #            causing the code to require the 'next/dist/compiled/@opentelemetry/api' module instead (which properly works)
  // #"@opentelemetry/api" = "./.next/standalone/node_modules/cf/templates/shims/throw.ts"
  const tracerFile = path.join(
    config.paths.standaloneApp,
    "node_modules",
    "next",
    "dist",
    "server",
    "lib",
    "trace",
    "tracer.js"
  );

  const pacthedTracer = fs
    .readFileSync(tracerFile, "utf-8")
    .replaceAll(/\w+\s*=\s*require\([^/]*opentelemetry.*\)/g, `throw new Error("@opentelemetry/api")`);

  writeFileSync(tracerFile, pacthedTracer);
}
