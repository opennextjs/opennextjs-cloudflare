/**
 * ESBuild stops calling `onLoad` hooks after the first hook returns an updated content.
 *
 * The updater allows multiple plugins to update the content.
 */

import { readFile } from "node:fs/promises";

import { type OnLoadArgs, type OnLoadOptions, type Plugin, type PluginBuild } from "esbuild";

/**
 * The callbacks returns either an updated content or undefined if the content is unchanged.
 */
export type Callback = (args: {
  contents: string;
  path: string;
}) => string | undefined | Promise<string | undefined>;

/**
 * The callback is called only when `contentFilter` matches the content.
 * It can be used as a fast heuristic to prevent an expensive update.
 */
export type OnUpdateOptions = OnLoadOptions & { contentFilter: RegExp };

export type Updater = OnUpdateOptions & { callback: Callback };

export class ContentUpdater {
  updaters = new Map<string, Updater>();

  /**
   * Register a callback to update the file content.
   *
   * The callbacks are called in order of registration.
   *
   * @param name The name of the plugin (must be unique).
   * @param options Options.
   * @param callback The callback updating the content.
   * @returns A noop ESBuild plugin.
   */
  updateContent(name: string, options: OnUpdateOptions, callback: Callback): Plugin {
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
          for (const { filter, namespace, contentFilter, callback } of this.updaters.values()) {
            if (namespace !== undefined && args.namespace !== namespace) {
              continue;
            }
            if (!args.path.match(filter)) {
              continue;
            }
            if (!contents.match(contentFilter)) {
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
