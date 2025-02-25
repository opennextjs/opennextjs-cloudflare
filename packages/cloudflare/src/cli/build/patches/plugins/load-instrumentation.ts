/**
 * `loadInstrumentationModule` uses a dynamic require which is not supported.
 */

import { type BuildOptions } from "@opennextjs/aws/build/helper.js";

import { getBuiltInstrumentationPath } from "../../utils/get-built-instrumentation-path.js";
import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function patchLoadInstrumentation(updater: ContentUpdater, buildOpts: BuildOptions) {
  const builtInstrumentationPath = getBuiltInstrumentationPath(buildOpts);

  return updater.updateContent(
    "patch-load-instrumentation",
    { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/, contentFilter: /async loadInstrumentationModule\(/ },
    async ({ contents }) => patchCode(contents, getRule(builtInstrumentationPath))
  );
}

export function getRule(builtInstrumentationPath: string | null) {
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
