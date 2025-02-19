import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

type RawManifest = {
  tag: { S: string };
  path: { S: string };
  revalidatedAt: { N: string };
}[];

/**
 * Generates SQL statements that can be used to initialise the cache assets manifest in an SQL data store.
 */
export function compileCacheAssetsManifestSqlFile(options: BuildOptions) {
  // TODO: Expose the function for getting this data as an adapter-agnostic utility in AWS.
  const rawManifestPath = path.join(options.outputDir, "dynamodb-provider/dynamodb-cache.json");
  const outputPath = path.join(options.outputDir, "cloudflare/cache-assets-manifest.sql");

  const table = process.env.NEXT_CACHE_D1 || "tags";

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `CREATE TABLE IF NOT EXISTS ${table} (tag TEXT NOT NULL, path TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag, path) ON CONFLICT REPLACE);\n`
  );

  if (existsSync(rawManifestPath)) {
    const rawManifest: RawManifest = JSON.parse(readFileSync(rawManifestPath, "utf-8"));

    const values = rawManifest.map(
      ({ tag, path, revalidatedAt }) =>
        `(${JSON.stringify(tag.S)}, ${JSON.stringify(path.S)}, ${revalidatedAt.N})`
    );

    if (values.length) {
      appendFileSync(outputPath, `INSERT INTO tags (tag, path, revalidatedAt) VALUES ${values.join(", ")};`);
    }
  }
}
