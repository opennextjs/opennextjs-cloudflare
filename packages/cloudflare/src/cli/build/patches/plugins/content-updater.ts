/**
 * ESBuild stops calling `onLoad` hooks after the first hook returns an updated content.
 *
 * The updater allows multiple plugins to update the content.
 */

import { readFile } from "node:fs/promises";

import { type OnLoadArgs, type OnLoadOptions, type Plugin, type PluginBuild } from "esbuild";

export type Callback = (args: {
  contents: string;
  path: string;
}) => string | undefined | Promise<string | undefined>;
export type Updater = OnLoadOptions & { callback: Callback };

export class ContentUpdater {
  updaters = new Map<string, Updater>();

  /**
   * Register a callback to update the file content.
   *
   * The callbacks are called in order of registration.
   *
   * @param name The name of the plugin (must be unique).
   * @param options Same options as the `onLoad` hook to restrict updates.
   * @param callback The callback updating the content.
   * @returns A noop ESBuild plugin.
   */
  updateContent(name: string, options: OnLoadOptions, callback: Callback): Plugin {
    if (this.updaters.has(name)) {
      throw new Error(`Plugin "${name}" already registered`);
    }
    this.updaters.set(name, { ...options, callback });
    return {
      name,
      setup() {},
    };
  }

  /**
   * Returns an ESBuild plugin applying the registered updates.
   */
  get plugin() {
    return {
      name: "aggregate-on-load",

      setup: async (build: PluginBuild) => {
        build.onLoad({ filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/ }, async (args: OnLoadArgs) => {
          let contents = await readFile(args.path, "utf-8");
          for (const { filter, namespace, callback } of this.updaters.values()) {
            if (namespace !== undefined && args.namespace !== namespace) {
              continue;
            }
            if (!filter.test(args.path)) {
              continue;
            }
            contents = (await callback({ contents, path: args.path })) ?? contents;
          }
          return { contents };
        });
      },
    };
  }
}
