import fs from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";

import { Config } from "../../../config";
import { extractProjectEnvVars } from "../../utils";

/**
 * Copies the template files present in the cloudflare adapter package into the
 * standalone node_modules folder and applies necessary transformations.
 */
export async function copyPackageCliFiles(
  packageDistDir: string,
  config: Config,
  openNextConfig: BuildOptions
) {
  console.log("# copyPackageTemplateFiles");
  const sourceDir = path.join(packageDistDir, "cli");
  const destinationDir = path.join(config.paths.internal.package, "cli");

  fs.cpSync(sourceDir, destinationDir, { recursive: true });

  const envVars = extractProjectEnvVars(openNextConfig);
  await build({
    entryPoints: [path.join(packageDistDir, "cli", "templates", "worker.ts")],
    outfile: path.join(openNextConfig.outputDir, "worker.js"),
    format: "esm",
    target: "esnext",
    bundle: false,
    minify: false,
    define: {
      __OPENNEXT_BUILD_TIME_ENV: JSON.stringify(envVars),
    },
  });
}
