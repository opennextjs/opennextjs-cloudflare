/**
 * Inline `loadManifest` as it relies on `readFileSync` that is not supported by workerd.
 */

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { glob } from "glob";

import { normalizePath } from "../../utils/normalize-path.js";
import { patchCode, type RuleConfig } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function inlineLoadManifest(updater: ContentUpdater, buildOpts: BuildOptions) {
  return updater.updateContent(
    "inline-load-manifest",
    {
      filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/load-manifest\.js$`, { escape: false }),
      contentFilter: /function loadManifest\(/,
    },
    async ({ contents }) => patchCode(contents, await getRule(buildOpts))
  );
}

async function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
  const dotNextDir = join(baseDir, ".next");

  const manifests = await glob(join(dotNextDir, "**/*-manifest.json"));

  const returnManifests = (
    await Promise.all(
      manifests.map(
        async (manifest) => `
            if ($PATH.endsWith("${normalizePath("/" + relative(dotNextDir, manifest))}")) {
              return ${await readFile(manifest, "utf-8")};
            }
          `
      )
    )
  ).join("\n");

  return {
    rule: {
      pattern: `
function loadManifest($PATH, $$$ARGS) {
  $$$_
}`,
    },
    fix: `
function loadManifest($PATH, $$$ARGS) {
  const { platform } = require('process');
  $PATH = platform === 'win32' ? $PATH.replaceAll('\\\\', '/') : $PATH;
  ${returnManifests}
  throw new Error(\`Unexpected loadManifest(\${$PATH}) call!\`);
}`,
  } satisfies RuleConfig;
}
