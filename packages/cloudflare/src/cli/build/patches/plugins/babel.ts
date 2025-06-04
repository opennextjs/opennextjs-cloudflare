/**
 * Patches to avoid pulling babel (~4MB).
 *
 * Details:
 * - empty `NextServer#runMiddleware` and `NextServer#runEdgeFunction` that are not used
 * - drop `next/dist/server/node-environment-extensions/error-inspect.js`
 */

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

/**
 * Swaps the body for a throwing implementation
 *
 * @param methodName The name of the method
 * @returns A rule to replace the body with a `throw`
 */
export function createEmptyBodyRule(methodName: string) {
  return `
rule:
  pattern:
    selector: method_definition
    context: "class { async ${methodName}($$$PARAMS) { $$$_ } }"
fix: |-
  async ${methodName}($$$PARAMS) {
    throw new Error("${methodName} should not be called by OpenNext");
  }
`;
}

/**
 * Drops `require("./node-environment-extensions/error-inspect");`
 */
export const errorInspectRule = `
rule:
  pattern: require("./node-environment-extensions/error-inspect");
fix: |-
  // Removed by OpenNext
  // require("./node-environment-extensions/error-inspect");
`;

export function patchDropBabel(updater: ContentUpdater): Plugin {
  updater.updateContent("drop-babel-next-server", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/next-server\.js$`, {
          escape: false,
        }),
        contentFilter: /runMiddleware\(/,
        callback: ({ contents }) => {
          contents = patchCode(contents, createEmptyBodyRule("runMiddleware"));
          contents = patchCode(contents, createEmptyBodyRule("runEdgeFunction"));
          return contents;
        },
      },
    },
  ]);

  updater.updateContent("drop-babel-error-inspect", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`next/dist/server/node-environment\.js$`, {
          escape: false,
        }),
        contentFilter: /node-environment-extensions\/error-inspect/,
        callback: ({ contents }) => patchCode(contents, errorInspectRule),
      },
    },
  ]);

  return {
    name: "drop-babel",
    setup() {},
  };
}
