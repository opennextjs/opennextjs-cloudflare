import * as fs from "node:fs";
import * as path from "node:path";

import { parse } from "@dotenvx/dotenvx";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

function readEnvFile(filePath: string) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return parse(fs.readFileSync(filePath).toString());
  }
}

/**
 * Extracts the environment variables defined in various .env files for a project.
 *
 * The `NEXTJS_ENV` environment variable in `.dev.vars` determines the mode.
 *
 * Merged variables respect the following priority order.
 * 1. `.env.{mode}.local`
 * 2. `.env.local` (when mode is not equal to `test`)
 * 3. `.env.{mode}`
 * 4. `.env`
 *
 * https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables#environment-variable-load-order
 *
 * In a monorepo, the env files in an app's directory will take precedence over
 * the env files at the root of the monorepo.
 */
export function extractProjectEnvVars(mode: string, { monorepoRoot, appPath }: BuildOptions) {
  return [".env", `.env.${mode}`, ...(mode !== "test" ? [".env.local"] : []), `.env.${mode}.local`]
    .flatMap((fileName) => [
      ...(monorepoRoot !== appPath ? [readEnvFile(path.join(monorepoRoot, fileName))] : []),
      readEnvFile(path.join(appPath, fileName)),
    ])
    .reduce<Record<string, string>>((acc, overrides) => ({ ...acc, ...overrides }), {});
}
