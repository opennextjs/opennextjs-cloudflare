/**
 * Removed unused `require.resolve` calls in Open Next.
 */

import path from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export function patchResolveCache(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
  const { outputDir } = buildOpts;
  const packagePath = getPackagePath(buildOpts);
  const outputPath = path.join(outputDir, "server-functions/default");

  const indexPath = path.relative(
    buildOpts.appBuildOutputPath,
    path.join(outputPath, packagePath, `index.mjs`)
  );

  return updater.updateContent("patch-resolve-cache", [
    {
      field: {
        filter: getCrossPlatformPathRegex(indexPath),
        contentFilter: /cacheHandlerPath/,
        callback: async ({ contents }) => {
          contents = patchCode(contents, cacheHandlerRule);
          contents = patchCode(contents, compositeCacheHandlerRule);
          return contents;
        },
      },
    },
  ]);
}

export const cacheHandlerRule = `
rule:
  pattern: var cacheHandlerPath = __require.resolve("./cache.cjs");
fix: |-
  var cacheHandlerPath = "";
`;

export const compositeCacheHandlerRule = `
rule:
  pattern: var composableCacheHandlerPath = __require.resolve("./composable-cache.cjs");
fix: |-
  var composableCacheHandlerPath = "";
`;
