/**
 * Inline `findDir` as it relies on `existsSync` which is not supported by workerd.
 */

import { existsSync } from "node:fs";
import { join, posix, sep } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

export function inlineFindDir(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
  return updater.updateContent("inline-find-dir", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/next/dist/lib/find-pages-dir\.js$`, { escape: false }),
        contentFilter: /function findDir\(/,
        callback: async ({ contents }) => patchCode(contents, await getRule(buildOpts)),
      },
    },
  ]);
}

async function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");

  const appExists = existsSync(join(baseDir, "app"));
  const pagesExists = existsSync(join(baseDir, "pages"));

  return `
rule:
  pattern: function findDir($DIR, $NAME) { $$$_ }
fix: |-
  function findDir($DIR, $NAME) {
    $DIR = $DIR.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)});
    if ($DIR.endsWith(".next/server")) {
      if ($NAME === "app") {
        return ${appExists};
      }
      if ($NAME === "pages") {
        return ${pagesExists};
      }
    }
    throw new Error(\`Unexpected findDir(\${$DIR}, \${$NAME}) call!\`);
  }
`;
}
