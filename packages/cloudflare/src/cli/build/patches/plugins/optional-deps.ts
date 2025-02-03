/**
 * ESBuild plugin to handle optional dependencies.
 *
 * Optional dependencies might be installed by the application to support optional features.
 *
 * When an optional dependency is installed, it must be inlined in the bundle.
 * When it is not installed, the plugin swaps it for a throwing implementation.
 *
 * The plugin uses ESBuild built-in resolution to check if the dependency is installed.
 */

import type { OnResolveResult, PluginBuild } from "esbuild";

export function handleOptionalDependencies(dependencies: string[]) {
  // Regex matching either a full module ("module") or a prefix ("module/...")
  const filter = new RegExp(
    `^(${dependencies.flatMap((name) => [`${name}$`, String.raw`${name}/`]).join("|")})`
  );

  const name = "optional-deps";
  const marker = {};
  const nsMissingDependency = `${name}-missing-dependency`;

  return {
    name,

    setup: async (build: PluginBuild) => {
      build.onResolve({ filter }, async ({ path, pluginData, ...options }): Promise<OnResolveResult> => {
        // Use ESBuild to resolve the dependency.
        // Because the plugin asks ESBuild to resolve the path we just received,
        // ESBuild will ask this plugin again.
        // We use a marker in the pluginData to break the loop.
        if (pluginData === marker) {
          return {};
        }
        const result = await build.resolve(path, {
          ...options,
          pluginData: marker,
        });

        // ESBuild reports error when the dependency is not installed.
        // In such a case the OnLoad hook will inline a throwing implementation.
        if (result.errors.length > 0) {
          return {
            path: `/${path}`,
            namespace: nsMissingDependency,
            pluginData: { name: path },
          };
        }

        // Returns ESBuild resolution information when the dependency is installed.
        return result;
      });

      // Replaces missing dependency with a throwing implementation.
      build.onLoad({ filter: /.*/, namespace: nsMissingDependency }, ({ pluginData }) => {
        return {
          contents: `throw new Error('Missing optional dependency "${pluginData.name}"')`,
        };
      });
    },
  };
}
