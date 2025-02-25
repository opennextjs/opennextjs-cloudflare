import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

/**
 * Gets the instrumentation.js file that the Next.js build process generates when an
 * instrumentation hook is provided in the app's source
 *
 * @param buildOpts the open-next build options
 * @returns a string pointing to the instrumentation.js file location, or null if such file is not found
 */
export function getBuiltInstrumentationPath(buildOpts: BuildOptions): string | null {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
  const dotNextDir = join(baseDir, ".next");
  const maybeBuiltInstrumentationPath = join(dotNextDir, "server", `${INSTRUMENTATION_HOOK_FILENAME}.js`);
  const builtInstrumentationPath = existsSync(maybeBuiltInstrumentationPath)
    ? maybeBuiltInstrumentationPath
    : null;

  return builtInstrumentationPath;
}

/**
 * Pattern to detect instrumentation hooks file
 * (taken from Next.js source: https://github.com/vercel/next.js/blob/1d5820563/packages/next/src/lib/constants.ts#L46-L47)
 */
const INSTRUMENTATION_HOOK_FILENAME = "instrumentation";
