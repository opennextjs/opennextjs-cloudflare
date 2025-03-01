import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { normalizePath } from "../../utils/normalize-path.js";
import { patchCode, type RuleConfig } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";
import { posix, sep } from "node:path";

export function inlineNodeModuleLoader(updater: ContentUpdater, buildOpts: BuildOptions) {
  return updater.updateContent(
    "inline-node-module-loader",
    {
      filter: getCrossPlatformPathRegex(
        String.raw`/next/dist/server/lib/module-loader/node-module-loader\.js$`,
        { escape: false }
      ),
      contentFilter: /class NodeModuleLoader {/,
    },
    async ({ contents }) => patchCode(contents, await getRule(buildOpts))
  );
}

async function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;
  const serverDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");

  const pagesManifestFile = join(serverDir, "pages-manifest.json");

  let pagesManifests: string[] = [];
  try {
    pagesManifests = Object.values(JSON.parse(await readFile(pagesManifestFile, "utf-8")));
  } catch {
    // The file does not exist
  }

  const files = pagesManifests.filter((file) => file.endsWith(".js")).map(normalizePath);

  // Inline fs access and dynamic requires that are not supported by workerd.
  const fnBody = `
${files
  .map(
    (file) => `if ($ID.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)}).endsWith(${JSON.stringify(file)})) {
  return require(${JSON.stringify(join(serverDir, file))});
}`
  )
  .join("\n")}
`;

  return {
    rule: {
      pattern: `class NodeModuleLoader {
    async load($ID) {
        $$$_BODY
    }
}`,
    },
    fix: `class NodeModuleLoader {
    async load($ID) {
        ${fnBody}
    }
}`,
  } satisfies RuleConfig;
}
