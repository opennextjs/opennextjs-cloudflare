import { readFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import type { Plugin } from "esbuild";

import { normalizePath } from "../../utils/normalize-path.js";
import { patchCode, type RuleConfig } from "../ast/util.js";
import type { ContentUpdater } from "./content-updater.js";

async function getPagesManifests(serverDir: string): Promise<string[]> {
  try {
    return Object.values(JSON.parse(await readFile(join(serverDir, "pages-manifest.json"), "utf-8")));
  } catch {
    // The file does not exist
    return [];
  }
}

async function getAppPathsManifests(serverDir: string): Promise<string[]> {
  try {
    return Object.values(JSON.parse(await readFile(join(serverDir, "app-paths-manifest.json"), "utf-8")));
  } catch {
    // The file does not exist
    return [];
  }
}

function getServerDir(buildOpts: BuildOptions) {
  return join(buildOpts.outputDir, "server-functions/default", getPackagePath(buildOpts), ".next/server");
}

function getRequires(idVariable: string, files: string[], serverDir: string) {
  // Inline fs access and dynamic requires that are not supported by workerd.
  return files
    .map(
      (file) => `
    if (${idVariable}.replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)}).endsWith(${JSON.stringify(normalizePath(file))})) {
      return require(${JSON.stringify(join(serverDir, file))});
    }`
    )
    .join("\n");
}

export function inlineDynamicRequires(updater: ContentUpdater, buildOpts: BuildOptions): Plugin {
  updater.updateContent(
    "inline-node-module-loader",
    {
      filter: getCrossPlatformPathRegex(String.raw`/module-loader/node-module-loader\.js$`, {
        escape: false,
      }),
      contentFilter: /class NodeModuleLoader {/,
    },
    async ({ contents }) => patchCode(contents, await getNodeModuleLoaderRule(buildOpts))
  );
  updater.updateContent(
    "inline-require-page",
    {
      filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/require\.js$`, { escape: false }),
      contentFilter: /function requirePage\(/,
    },
    async ({ contents }) => patchCode(contents, await getRequirePageRule(buildOpts))
  );
  return { name: "inline-dynamic-requires", setup() {} };
}

async function getNodeModuleLoaderRule(buildOpts: BuildOptions) {
  const serverDir = getServerDir(buildOpts);

  const manifests = await getPagesManifests(serverDir);

  const files = manifests.filter((file) => file.endsWith(".js"));

  return `
rule:
  kind: method_definition
  all:
    - has:
        field: name
        regex: ^load$
    - has:
        field: parameters
        has:
          kind: required_parameter
          pattern: $ID
  inside:
    stopBy:
      kind: class_declaration
    kind: class_declaration
    has:
      field: name
      regex: ^NodeModuleLoader$
fix: |
  async load($ID) {
    ${getRequires("$ID", files, serverDir)}
  }`;
}

async function getRequirePageRule(buildOpts: BuildOptions) {
  const serverDir = getServerDir(buildOpts);

  const pagesManifests = await getPagesManifests(serverDir);
  const appPathsManifests = await getAppPathsManifests(serverDir);

  const manifests = pagesManifests.concat(appPathsManifests);

  const htmlFiles = manifests.filter((file) => file.endsWith(".html"));
  const jsFiles = manifests.filter((file) => file.endsWith(".js"));

  return {
    rule: {
      pattern: `
function requirePage($PAGE, $DIST_DIR, $IS_APP_PATH) {
  const $_ = getPagePath($$$ARGS);
  $$$_BODY
}`,
    }, // Inline fs access and dynamic require that are not supported by workerd.
    fix: `
function requirePage($PAGE, $DIST_DIR, $IS_APP_PATH) {
  const pagePath = getPagePath($$$ARGS).replaceAll(${JSON.stringify(sep)}, ${JSON.stringify(posix.sep)});

  // html
  ${(
    await Promise.all(
      htmlFiles.map(
        async (file) => `if (pagePath.endsWith(${JSON.stringify(normalizePath(file))})) {
    return ${JSON.stringify(await readFile(join(serverDir, file), "utf-8"))};
  }`
      )
    )
  ).join("\n")}
  // js
    process.env.__NEXT_PRIVATE_RUNTIME_TYPE = $IS_APP_PATH ? 'app' : 'pages';
  try {
    ${getRequires("pagePath", jsFiles, serverDir)}
  } finally {
    process.env.__NEXT_PRIVATE_RUNTIME_TYPE = '';
  }
}`,
  } satisfies RuleConfig;
}
