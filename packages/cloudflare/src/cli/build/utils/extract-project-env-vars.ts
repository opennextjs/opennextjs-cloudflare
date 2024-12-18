import * as fs from "node:fs";
import * as path from "node:path";

import { parse } from "@dotenvx/dotenvx";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

function readEnvFiles(fileNames: string[], { monorepoRoot, appPath }: BuildOptions) {
  return fileNames
    .flatMap((fileName) => [
      ...(monorepoRoot !== appPath ? [path.join(monorepoRoot, fileName)] : []),
      path.join(appPath, fileName),
    ])
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .map((filePath) => parse(fs.readFileSync(filePath).toString()));
}

/**
 * Extracts the environment variables defined in various .env files for a project.
 *
 * The `NEXTJS_ENV` environment variable in `.dev.vars` determines the mode.
 *
 * Merged variables respect the following priority order.
 * 1. `.env.{mode}.local`
 * 2. `.env.local`
 * 3. `.env.{mode}`
 * 4. `.env`
 *
 * In a monorepo, the env files in an app's directory will take precedence over
 * the env files at the root of the monorepo.
 */
export function extractProjectEnvVars(mode: string, options: BuildOptions) {
  const envVars = readEnvFiles([".env", `.env.${mode}`, ".env.local", `.env.${mode}.local`], options);

  return envVars.reduce<Record<string, string>>((acc, overrides) => ({ ...acc, ...overrides }), {});
}
