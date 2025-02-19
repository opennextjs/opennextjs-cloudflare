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

  const tagsTable = process.env.NEXT_CACHE_D1_TAGS_TABLE || "tags";
  const revalidationsTable = process.env.NEXT_CACHE_D1_REVALIDATIONS_TABLE || "revalidations";

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `CREATE TABLE IF NOT EXISTS ${tagsTable} (tag TEXT NOT NULL, path TEXT NOT NULL, UNIQUE(tag, path) ON CONFLICT REPLACE);
     CREATE TABLE IF NOT EXISTS ${revalidationsTable} (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);\n`
  );

  if (existsSync(rawManifestPath)) {
    const rawManifest: RawManifest = JSON.parse(readFileSync(rawManifestPath, "utf-8"));

    const values = rawManifest.map(
      ({ tag, path }) => `(${JSON.stringify(tag.S)}, ${JSON.stringify(path.S)})`
    );

    if (values.length) {
      appendFileSync(outputPath, `INSERT INTO ${tagsTable} (tag, path) VALUES ${values.join(", ")};`);
    }
  }
}
