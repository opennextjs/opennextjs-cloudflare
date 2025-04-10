import fs from "node:fs";
import path from "node:path";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";

import { extractProjectEnvVars } from "../utils/index.js";

/**
 * Compiles the values extracted from the project's env files to the output directory for use in the worker.
 */
export function compileEnvFiles(buildOpts: BuildOptions) {
  const envDir = path.join(buildOpts.outputDir, "cloudflare");
  fs.mkdirSync(envDir, { recursive: true });
  ["production", "development", "test"].forEach((mode) =>
    fs.appendFileSync(
      path.join(envDir, `next-env.mjs`),
      `export const ${mode} = ${JSON.stringify(extractProjectEnvVars(mode, buildOpts))};\n`
    )
  );
}
