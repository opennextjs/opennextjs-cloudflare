/**
 * Makes files handled by wrangler external.
 *
 * Paths need to be absolute so that they are valid in the output bundle.
 */

import { dirname, resolve } from "node:path";

import type { PluginBuild } from "esbuild";

export default function setWranglerExternal() {
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
