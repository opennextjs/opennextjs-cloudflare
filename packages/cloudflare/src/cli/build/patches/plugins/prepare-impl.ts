/**
 * `prepareImpl` uses a dynamic require which is not supported.
 *
 * `prepareImpl` is the method that sets up instrumentation in Next 14 (this is `loadInstrumentationModule` in Next 15).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function patchPrepareImpl(updater: ContentUpdater, buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
  const dotNextDir = join(baseDir, ".next");
  const maybeBuiltInstrumentationPath = join(dotNextDir, "server", `${INSTRUMENTATION_HOOK_FILENAME}.js`);
  const builtInstrumentationPath = existsSync(maybeBuiltInstrumentationPath)
    ? maybeBuiltInstrumentationPath
    : null;

  return updater.updateContent(
    "patch-prepareImpl",
    { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /async prepareImpl\(/ },
    async ({ contents }) => patchCode(contents, await getRule(builtInstrumentationPath))
  );
}

export async function getRule(builtInstrumentationPath: string | null) {
  return `
    rule:
      kind: method_definition
      any:
        - has: { field: name, regex: ^prepareImpl$, pattern: $NAME }
      all:
        - has: { pattern: dynamicRequire, stopBy: end }
        - has: { pattern: $_.INSTRUMENTATION_HOOK_FILENAME, stopBy: end }
    fix: |-
        async $NAME() {
          await super.prepareImpl();
          const instrumentationHook = ${builtInstrumentationPath ? `require('${builtInstrumentationPath}')` : "{}"};
          await (instrumentationHook.register == null ? void 0 : instrumentationHook.register.call(instrumentationHook));
        }
  `;
}

/**
 * Pattern to detect instrumentation hooks file
 * (taken from Next.js source: https://github.com/vercel/next.js/blob/1d5820563/packages/next/src/lib/constants.ts#L46-L47)
 */
const INSTRUMENTATION_HOOK_FILENAME = "instrumentation";
