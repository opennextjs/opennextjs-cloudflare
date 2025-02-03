/**
 * ESBuild plugin to mark files bundled by wrangler as external.
 *
 * `.wasm` and `.bin` will ultimately be bundled by wrangler.
 * We should only mark them as external in the adapter.
 *
 * However simply marking them as external would copy the import path to the bundle,
 * i.e. `import("./file.wasm?module")` and given than the bundle is generated in a
 * different location than the input files, the relative path would not be valid.
 *
 * This ESBuild plugin convert relative paths to absolute paths so that they are
 * still valid from inside the bundle.
 *
 * ref: https://developers.cloudflare.com/workers/wrangler/bundling/
 */

import { dirname, resolve } from "node:path";

import type { PluginBuild } from "esbuild";

export function setWranglerExternal() {
  return {
    name: "wrangler-externals",

    setup: async (build: PluginBuild) => {
      const namespace = "wrangler-externals-plugin";

      build.onResolve({ filter: /(\.bin|\.wasm\?module)$/ }, ({ path, importer }) => {
        return {
          path: resolve(dirname(importer), path),
          namespace,
          external: true,
        };
      });

      build.onLoad({ filter: /.*/, namespace }, async ({ path }) => {
        return {
          contents: `export * from '${path}';`,
        };
      });
    },
  };
}
