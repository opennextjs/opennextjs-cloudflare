import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import type { PluginBuild } from "esbuild";

import { patchCode, type RuleConfig } from "../ast/util.js";

export function inlineRequirePagePlugin(buildOpts: BuildOptions) {
  return {
    name: "inline-require-page",

    setup: async (build: PluginBuild) => {
      build.onLoad(
        {
          filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/require\.js$`, { escape: false }),
        },
        async ({ path }) => {
          const jsCode = await readFile(path, "utf8");
          if (/function requirePage\(/.test(jsCode)) {
            return { contents: patchCode(jsCode, await getRule(buildOpts)) };
          }
        }
      );
    },
  };
}

async function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;
  const serverDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");

  const pagesManifestFile = join(serverDir, "pages-manifest.json");
  const appPathsManifestFile = join(serverDir, "app-paths-manifest.json");

  let pagesManifests: string[] = [];
  try {
    pagesManifests = Object.values(JSON.parse(await readFile(pagesManifestFile, "utf-8")));
  } catch {
    // The file does not exists
    pagesManifests = [];
  }

  let appPathsManifests: string[];
  try {
    appPathsManifests = Object.values(JSON.parse(await readFile(appPathsManifestFile, "utf-8")));
  } catch {
    // The file does not exists
    appPathsManifests = [];
  }

  const manifests = pagesManifests.concat(appPathsManifests);

  const htmlFiles = manifests.filter((file) => file.endsWith(".html"));
  const jsFiles = manifests.filter((file) => file.endsWith(".js"));

  // Inline fs access and dynamic require that are not supported by workerd.
  const fnBody = `
// html
${(
  await Promise.all(
    htmlFiles.map(
      async (file) => `if (pagePath.endsWith("${file}")) {
        return ${JSON.stringify(await readFile(join(serverDir, file), "utf-8"))};
      }`
    )
  )
).join("\n")}
// js
process.env.__NEXT_PRIVATE_RUNTIME_TYPE = isAppPath ? 'app' : 'pages';
try {
  ${jsFiles
    .map(
      (file) => `if (pagePath.endsWith("${file}")) {
        return require(${JSON.stringify(join(serverDir, file))});
      }`
    )
    .join("\n")}
} finally {
  process.env.__NEXT_PRIVATE_RUNTIME_TYPE = '';
}
`;

  return {
    rule: {
      pattern: `
function requirePage($PAGE, $DIST_DIR, $IS_APP_PATH) {
  const $_ = getPagePath($$$ARGS);
  $$$_BODY
}`,
    },
    fix: `
function requirePage($PAGE, $DIST_DIR, $IS_APP_PATH) {
  const pagePath = getPagePath($$$ARGS);
  ${fnBody}
}`,
  } satisfies RuleConfig;
}
