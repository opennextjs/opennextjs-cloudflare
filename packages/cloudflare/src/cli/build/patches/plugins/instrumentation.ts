import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";

export function patchInstrumentation(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
  const builtInstrumentationPath = getBuiltInstrumentationPath(buildOpts);

  updater.updateContent("patch-instrumentation-next15", [
    {
      field: {
        filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/,
        contentFilter: /async loadInstrumentationModule\(/,
        callback: ({ contents }) => patchCode(contents, getNext15Rule(builtInstrumentationPath)),
      },
    },
  ]);

  updater.updateContent("patch-instrumentation-next14", [
    {
      field: {
        filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/,
        contentFilter: /async prepareImpl\(/,
        callback: ({ contents }) => patchCode(contents, getNext14Rule(builtInstrumentationPath)),
      },
    },
  ]);

  return {
    name: "patch-instrumentation",
    setup() {},
  };
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
 * @returns the path to instrumentation.js, or null if it doesn't exist
 */
function getBuiltInstrumentationPath(buildOpts: BuildOptions): string | null {
  const { outputDir } = buildOpts;

  const maybeBuiltInstrumentationPath = join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    `.next/server/${INSTRUMENTATION_HOOK_FILENAME}.js`
  );
  return existsSync(maybeBuiltInstrumentationPath) ? maybeBuiltInstrumentationPath : null;
}

/**
 * Pattern to detect instrumentation hooks file
 * (taken from Next.js source: https://github.com/vercel/next.js/blob/1d5820563/packages/next/src/lib/constants.ts#L46-L47)
 */
const INSTRUMENTATION_HOOK_FILENAME = "instrumentation";
