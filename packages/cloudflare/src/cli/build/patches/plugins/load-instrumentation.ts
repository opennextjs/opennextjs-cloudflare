/**
 * `loadInstrumentationModule` uses a dynamic require which is not supported.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function patchLoadInstrumentation(updater: ContentUpdater, buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
  const dotNextDir = join(baseDir, ".next");
  const builtInstrumentationPath = join(dotNextDir, "server", `${INSTRUMENTATION_HOOK_FILENAME}.js`);

  return updater.updateContent(
    "patch-load-instrumentation",
    { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /async loadInstrumentationModule\(/ },
    async ({ contents }) => patchCode(contents, await getRule(builtInstrumentationPath))
  );
}

export async function getRule(builtInstrumentationPath: string) {
  return `
    rule:
      kind: method_definition
      all:
        - has: {field: name, regex: ^loadInstrumentationModule$}
        - has: {pattern: dynamicRequire, stopBy: end}

    fix:
      async loadInstrumentationModule() {
        this.instrumentation = ${existsSync(builtInstrumentationPath) ? `require('${builtInstrumentationPath}')` : "null"};
        return this.instrumentation;
      }
  `;
}

/**
 * Pattern to detect instrumentation hooks file
 * (taken from Next.js source: https://github.com/vercel/next.js/blob/1d5820563/packages/next/src/lib/constants.ts#L46-L47)
 */
const INSTRUMENTATION_HOOK_FILENAME = "instrumentation";
