/**
 * Misc patches for `next-server.js`
 *
 * Note: we will probably need to revisit the patches when the Next adapter API lands
 *
 * - Inline `getBuildId` as it relies on `readFileSync` that is not supported by workerd
 * - Inline the middleware manifest
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export function patchNextServer(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
  return updater.updateContent("next-server", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/next-server\.js$`, {
          escape: false,
        }),
        contentFilter: /getBuildId\(/,
        callback: async ({ contents }) => {
          const { outputDir } = buildOpts;

          const manifestPath = join(
            outputDir,
            "server-functions/default",
            getPackagePath(buildOpts),
            ".next/server/middleware-manifest.json"
          );

          const manifest = existsSync(manifestPath)
            ? JSON.parse(await readFileSync(manifestPath, "utf-8"))
            : {};

          contents = patchCode(contents, buildIdRule);
          contents = patchCode(contents, createMiddlewareManifestRule(manifest));
          return contents;
        },
      },
    },
  ]);
}

export const buildIdRule = `
rule:
  pattern:
    selector: method_definition
    context: "class { getBuildId($$$PARAMS) { $$$_ } }"
fix: |-
  getBuildId($$$PARAMS) {
    return process.env.NEXT_BUILD_ID;
  }
`;

export function createMiddlewareManifestRule(manifest: unknown) {
  return `
rule:
  pattern:
    selector: method_definition
    context: "class { getMiddlewareManifest($$$PARAMS) { $$$_ } }"
fix: |-
  getMiddlewareManifest($$$PARAMS) {
    return ${JSON.stringify(manifest)};
  }
`;
}
