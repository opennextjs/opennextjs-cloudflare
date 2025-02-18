/**
 * Inline `evalManifest` as it relies on `readFileSync` and `runInNewContext`
 * that are not supported by workerd.
 */

import { join, relative } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import { glob } from "glob";

import { normalizePath } from "../../utils/normalize-path.js";
import { patchCode, type RuleConfig } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

export function inlineEvalManifest(updater: ContentUpdater, buildOpts: BuildOptions) {
  return updater.updateContent(
    "inline-eval-manifest",
    {
      filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/load-manifest\.js$`, { escape: false }),
      contentFilter: /function evalManifest\(/,
    },
    async ({ contents }) => patchCode(contents, await getRule(buildOpts))
  );
}

async function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;

  const baseDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next");
  const appDir = join(baseDir, "server/app");
  const manifests = await glob(join(baseDir, "**/*_client-reference-manifest.js"));

  const returnManifests = manifests
    .map((manifest) => {
      const endsWith = normalizePath(relative(baseDir, manifest));
      const key = normalizePath("/" + relative(appDir, manifest)).replace(
        "_client-reference-manifest.js",
        ""
      );
      return `
          if ($PATH.endsWith("${endsWith}")) {
            require(${JSON.stringify(manifest)});
            return {
              __RSC_MANIFEST: {
              "${key}": globalThis.__RSC_MANIFEST["${key}"],
              },
            };
          }
        `;
    })
    .join("\n");

  return {
    rule: {
      pattern: `
function evalManifest($PATH, $$$ARGS) {
  $$$_
}`,
    },
    fix: `
function evalManifest($PATH, $$$ARGS) {
  ${returnManifests}
  throw new Error("Unknown evalManifest: " + $PATH);
}`,
  } satisfies RuleConfig;
}
