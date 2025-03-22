/**
 * Inline `loadManifest` as it relies on `readFileSync` that is not supported by workerd.
 */

import { readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode, type RuleConfig } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { glob } from "glob";

import { normalizePath } from "../../utils/normalize-path.js";

export function inlineLoadManifest(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
  return updater.updateContent("inline-load-manifest", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/load-manifest\.js$`, {
          escape: false,
        }),
        contentFilter: /function loadManifest\(/,
        callback: async ({ contents }) => patchCode(contents, await getRule(buildOpts)),
      },
    },
  ]);
}

async function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts));
  const dotNextDir = join(baseDir, ".next");

  const manifests = await glob(join(dotNextDir, "**/*-manifest.json"), { windowsPathsNoEscape: true });

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
  $PATH = $PATH.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)});
  ${returnManifests}
  throw new Error(\`Unexpected loadManifest(\${$PATH}) call!\`);
}`,
  } satisfies RuleConfig;
}
