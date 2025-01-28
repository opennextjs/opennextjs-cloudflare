import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import type { PluginBuild } from "esbuild";

import { patchCode, type RuleConfig } from "../ast/util.js";

export default function inlineRequirePagePlugin(buildOpts: BuildOptions) {
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
            return { contents: patchCode(jsCode, getRule(buildOpts)) };
          }
        }
      );
    },
  };
}

function getRule(buildOpts: BuildOptions) {
  const { outputDir } = buildOpts;
  const serverDir = join(outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");

  const pagesManifestFile = join(serverDir, "pages-manifest.json");
  const appPathsManifestFile = join(serverDir, "app-paths-manifest.json");

  const pagesManifests: string[] = existsSync(pagesManifestFile)
    ? Object.values(JSON.parse(readFileSync(pagesManifestFile, "utf-8")))
    : [];
  const appPathsManifests: string[] = existsSync(appPathsManifestFile)
    ? Object.values(JSON.parse(readFileSync(appPathsManifestFile, "utf-8")))
    : [];
  const manifests = pagesManifests.concat(appPathsManifests);

  const htmlFiles = manifests.filter((file) => file.endsWith(".html"));
  const jsFiles = manifests.filter((file) => file.endsWith(".js"));

  // Inline fs access and dynamic require that are not supported by workerd.
  const fnBody = `
// html
${htmlFiles
  .map(
    (file) => `if (pagePath.endsWith("${file}")) {
        return ${JSON.stringify(readFileSync(join(serverDir, file), "utf-8"))};
      }`
  )
  .join("\n")}
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
function requirePage($PAGE, $DIST_DIR, $IS_APPP_ATH) {
  const $_ = getPagePath($$$ARGS);
  $$$_BODY
}`,
    },
    fix: `
function requirePage($PAGE, $DIST_DIR, $IS_APPP_ATH) {
  const pagePath = getPagePath($$$ARGS);
  ${fnBody}
}`,
  } satisfies RuleConfig;
}
