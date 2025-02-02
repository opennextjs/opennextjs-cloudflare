import { readFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { getBuildId } from "@opennextjs/aws/build/helper.js";
import { globSync } from "glob";

type CacheInfo = {
  type: string;
  meta?: {
    headers?: {
      "x-next-cache-tags"?: string;
    };
  };
};

export type CacheAssetsManifest = {
  tags: { [tag: string]: string[] };
  paths: { [path: string]: string[] };
};

/**
 * Extracts a map of the cache assets that were generated during the build.
 *
 * The mapping creates an index of each tags pointing to its paths, and each path pointing to its tags.
 */
export function extractCacheAssetsManifest(buildOpts: BuildOptions) {
  const cachePath = path.join(buildOpts.outputDir, "cache");
  const buildId = getBuildId(buildOpts);

  const manifest = globSync(path.join(cachePath, buildId, "**/*.cache")).reduce<CacheAssetsManifest>(
    (acc, p) => {
      const { meta } = JSON.parse(readFileSync(p, "utf-8")) as CacheInfo;
      const tags = meta?.headers?.["x-next-cache-tags"]?.split(",")?.map((tag) => `${buildId}/${tag}`) ?? [];

      const routePath = path.relative(cachePath, p).replace(/\.cache$/, "");

      acc.paths[routePath] = tags;

      for (const tag of tags) {
        if (!acc.tags[tag]) {
          acc.tags[tag] = [routePath];
        } else {
          acc.tags[tag].push(routePath);
        }
      }

      return acc;
    },
    { tags: {}, paths: {} }
  );

  return manifest;
}
