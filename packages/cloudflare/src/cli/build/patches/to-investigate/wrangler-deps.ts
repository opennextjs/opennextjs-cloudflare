import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

export function patchWranglerDeps(buildOpts: BuildOptions) {
  console.log("# patchWranglerDeps");

  const { outputDir } = buildOpts;

  const nextDistDir = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    "node_modules/next/dist"
  );

  // we shim @opentelemetry/api to the throwing shim so that it will throw right away, this is so that we throw inside the
  // try block here: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31
  // causing the code to require the 'next/dist/compiled/@opentelemetry/api' module instead (which properly works)
  const tracerFile = join(nextDistDir, "server/lib/trace/tracer.js");

  const patchedTracer = readFileSync(tracerFile, "utf-8").replaceAll(
    /\w+\s*=\s*require\([^/]*opentelemetry.*\)/g,
    `throw new Error("@opentelemetry/api")`
  );

  writeFileSync(tracerFile, patchedTracer);
}
