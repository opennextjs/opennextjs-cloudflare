import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";

/**
 * Some dependencies of Next.js use depd to deprecate some of their functions, depd uses `eval` to generate
 * a deprecated version of such functions, this causes `eval` warnings in the terminal even if these functions
 * are never called, this function fixes that by patching the depd `wrapfunction` function so that it still
 * retains the same type of behavior but without using `eval`
 */
export function patchDepdDeprecations(updater: ContentUpdater): Plugin {
  return updater.updateContent("patch-depd-deprecations", [
    {
      field: {
        filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/,
        contentFilter: /argument fn must be a function/,
        callback: ({ contents }) => patchCode(contents, rule),
      },
    },
  ]);
}

export const rule = `
rule:
  kind: function_declaration
  pattern: function wrapfunction($FN, $MESSAGE) { $$$ }
  all:
    - has:
        kind: variable_declarator
        stopBy: end
        has:
          field: name
          pattern: deprecatedfn
    - has:
        kind: call_expression
        stopBy: end
        has:
          kind: identifier
          pattern: eval
fix:
  function wrapfunction($FN, $MESSAGE) {
    if(typeof $FN !== 'function') throw new Error("argument fn must be a function");
    return function deprecated_$FN(...args) {
      console.warn($MESSAGE);
      return $FN(...args);
    }
  }
`;
