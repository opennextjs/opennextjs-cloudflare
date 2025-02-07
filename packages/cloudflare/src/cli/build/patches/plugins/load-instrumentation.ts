/**
 * `loadInstrumentationModule` uses a dynamic require which is not supported.
 */

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export const instrumentationRule = `
rule:
  kind: method_definition
  all:
    - has: {field: name, regex: ^loadInstrumentationModule$}
    - has: {pattern: dynamicRequire, stopBy: end}

fix: async loadInstrumentationModule() { }
`;

export function patchLoadInstrumentation(updater: ContentUpdater) {
  return updater.updateContent(
    "patch-load-instrumentation",
    { filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/ },
    ({ contents }) => {
      if (/async loadInstrumentationModule\(/.test(contents)) {
        return patchCode(contents, instrumentationRule);
      }
    }
  );
}
