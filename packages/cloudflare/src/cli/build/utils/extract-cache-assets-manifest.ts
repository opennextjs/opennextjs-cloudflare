import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

type RawManifest = {
  tag: { S: string };
  path: { S: string };
  revalidatedAt: { N: string };
}[];

export type CacheAssetsManifest = {
  tags: { [tag: string]: string[] };
  paths: { [path: string]: string[] };
};

/**
 * Extracts a map of the cache assets that were generated during the build.
 *
 * The mapping creates an index of each tags pointing to its paths, and each path pointing to its tags.
 */
export function extractCacheAssetsManifest(options: BuildOptions): CacheAssetsManifest {
  // TODO: Expose the function for getting this data as an adapter-agnostic utility in AWS.
  const rawManifestPath = path.join(options.outputDir, "dynamodb-provider", "dynamodb-cache.json");

  if (!existsSync(rawManifestPath)) {
    return { tags: {}, paths: {} };
  }

  const rawManifest: RawManifest = JSON.parse(readFileSync(rawManifestPath, "utf-8"));

  const manifest = rawManifest.reduce<CacheAssetsManifest>(
    (acc, { tag: { S: tag }, path: { S: path } }) => {
      if (!acc.paths[path]) {
        acc.paths[path] = [tag];
      } else {
        acc.paths[path].push(tag);
      }

      if (!acc.tags[tag]) {
        acc.tags[tag] = [path];
      } else {
        acc.tags[tag].push(path);
      }

      return acc;
    },
    { tags: {}, paths: {} }
  );

  return manifest;
}
