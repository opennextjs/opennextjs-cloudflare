/**
 * Inline `findDir` as it relies on `existsSync` which is not supported by workerd.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { patchCode } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function inlineFindDir(updater: ContentUpdater, buildOpts: BuildOptions) {
  return updater.updateContent(
    "inline-find-dir",
    {
      filter: getCrossPlatformPathRegex(String.raw`/next/dist/lib/find-pages-dir\.js$`, { escape: false }),
      contentFilter: /function findDir\(/,
    },
    async ({ contents }) => patchCode(contents, await getRule(buildOpts))
  );
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
    const { platform } = require('process');
    $DIR = platform === 'win32' ? $DIR.replaceAll('\\\\', '/') : $DIR;
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
