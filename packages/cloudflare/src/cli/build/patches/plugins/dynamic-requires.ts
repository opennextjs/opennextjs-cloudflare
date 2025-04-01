import { readFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { patchCode, type RuleConfig } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";

import { normalizePath } from "../../utils/normalize-path.js";

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
  updater.updateContent("inline-node-module-loader", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/module-loader/node-module-loader\.js$`, {
          escape: false,
        }),
        contentFilter: /class NodeModuleLoader {/,
        callback: async ({ contents }) => patchCode(contents, await getNodeModuleLoaderRule(buildOpts)),
      },
    },
  ]);
  updater.updateContent("inline-require-page", [
    {
      field: {
        filter: getCrossPlatformPathRegex(String.raw`/next/dist/server/require\.js$`, { escape: false }),
        contentFilter: /function requirePage\(/,
        callback: async ({ contents }) => patchCode(contents, await getRequirePageRule(buildOpts)),
      },
    },
  ]);
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
    ${
      buildOpts.debug
        ? `   try {
      ${getRequires("$ID", files, serverDir)}
    } catch (e) {
      console.error('Exception in NodeModuleLoader', e);
      throw e;
    }`
        : getRequires("$ID", files, serverDir)
    }
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
  } ${
    buildOpts.debug
      ? `
  catch (e) {
    console.error("Exception in requirePage", e);
    throw e;
  }`
      : ``
  }
  finally {
    process.env.__NEXT_PRIVATE_RUNTIME_TYPE = '';
  }
}`,
  } satisfies RuleConfig;
}
