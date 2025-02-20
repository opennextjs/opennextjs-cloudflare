/**
 * Inline `getBuildId` as it relies on `readFileSync` that is not supported by workerd.
 */

import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function inlineBuildId(updater: ContentUpdater) {
  return updater.updateContent(
    "inline-build-id",
    {
      filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/next-server\.js$`, { escape: false }),
      contentFilter: /getBuildId\(/,
    },
    async ({ contents }) => patchCode(contents, rule)
  );
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
