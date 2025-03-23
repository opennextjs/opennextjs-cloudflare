/**
 * Inline `getBuildId` as it relies on `readFileSync` that is not supported by workerd.
 */

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export function inlineBuildId(updater: ContentUpdater): Plugin {
  return updater.updateContent("inline-build-id", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/next-server\.js$`, {
          escape: false,
        }),
        contentFilter: /getBuildId\(/,
        callback: ({ contents }) => patchCode(contents, rule),
      },
    },
  ]);
}

export const rule = `
rule:
  kind: method_definition
  has:
    field: name
    regex: ^getBuildId$
fix: |-
  getBuildId() {
    return process.env.NEXT_BUILD_ID;
  }
`;
