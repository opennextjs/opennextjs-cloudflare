import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function patchInstrumentation(updater: ContentUpdater, buildOpts: BuildOptions) {
  const builtInstrumentationPath = getBuiltInstrumentationPath(buildOpts);

  return [
    updater.updateContent(
      "patch-load-instrumentation",
      { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /async loadInstrumentationModule\(/ },
      async ({ contents }) => patchCode(contents, getNext15Rule(builtInstrumentationPath))
    ),
    updater.updateContent(
      "patch-prepareImpl",
      { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /async prepareImpl\(/ },
      async ({ contents }) => patchCode(contents, getNext14Rule(builtInstrumentationPath))
    ),
  ];
}

export function getNext15Rule(builtInstrumentationPath: string | null) {
  return `
    rule:
      kind: method_definition
      all:
        - has: {field: name, regex: ^loadInstrumentationModule$}
        - has: {pattern: dynamicRequire, stopBy: end}

    fix:
      async loadInstrumentationModule() {
        this.instrumentation = ${builtInstrumentationPath ? `require('${builtInstrumentationPath}')` : "null"};
        return this.instrumentation;
      }
  `;
}

export function getNext14Rule(builtInstrumentationPath: string | null) {
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
 * Gets the instrumentation.js file that the Next.js build process generates when an
 * instrumentation hook is provided in the app's source
 *
 * @param buildOpts the open-next build options
 * @returns a string pointing to the instrumentation.js file location, or null if such file is not found
 */
function getBuiltInstrumentationPath(buildOpts: BuildOptions): string | null {
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
