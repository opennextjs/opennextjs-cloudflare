/**
 * `prepareImpl` uses a dynamic require which is not supported.
 *
 * `prepareImpl` is the method that sets up instrumentation in Next 14 (this is `loadInstrumentationModule` in Next 15).
 */

import { type BuildOptions } from "@opennextjs/aws/build/helper.js";

import { getBuiltInstrumentationPath } from "../../utils/get-built-instrumentation-path.js";
import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function patchPrepareImpl(updater: ContentUpdater, buildOpts: BuildOptions) {
  const builtInstrumentationPath = getBuiltInstrumentationPath(buildOpts);

  return updater.updateContent(
    "patch-prepareImpl",
    { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /async prepareImpl\(/ },
    async ({ contents }) => patchCode(contents, getRule(builtInstrumentationPath))
  );
}

export function getRule(builtInstrumentationPath: string | null) {
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
