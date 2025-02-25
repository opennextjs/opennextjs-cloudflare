import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import type { TagCacheMetaFile } from "@opennextjs/aws/types/cache.js";

/**
 * Generates SQL statements that can be used to initialise the cache assets manifest in an SQL data store.
 */
export function compileCacheAssetsManifestSqlFile(options: BuildOptions, metaFiles: TagCacheMetaFile[]) {
  const outputPath = path.join(options.outputDir, "cloudflare/cache-assets-manifest.sql");

  const tagsTable = process.env.NEXT_CACHE_D1_TAGS_TABLE || "tags";
  const revalidationsTable = process.env.NEXT_CACHE_D1_REVALIDATIONS_TABLE || "revalidations";

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `CREATE TABLE IF NOT EXISTS ${JSON.stringify(tagsTable)} (tag TEXT NOT NULL, path TEXT NOT NULL, UNIQUE(tag, path) ON CONFLICT REPLACE);
     CREATE TABLE IF NOT EXISTS ${JSON.stringify(revalidationsTable)} (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);\n`
  );

  const values = metaFiles.map(({ tag, path }) => `(${JSON.stringify(tag.S)}, ${JSON.stringify(path.S)})`);

  if (values.length) {
    appendFileSync(
      outputPath,
      `INSERT INTO ${JSON.stringify(tagsTable)} (tag, path) VALUES ${values.join(", ")};`
    );
  }
}
