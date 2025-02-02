import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import type { TagCache } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "./cloudflare-context.js";

// inlined during build
const manifest = process.env.__OPENNEXT_CACHE_TAGS_MANIFEST;

class D1TagCache implements TagCache {
  public name = "d1-tag-cache";

  public async getByPath(rawPath: string): Promise<string[]> {
    const { isDisabled, db, table } = this.getConfig();
    if (isDisabled) return [];

    const path = this.getCacheKey(rawPath);

    try {
      const { success, results } = await db
        .prepare(`SELECT tag FROM ${table} WHERE path = ?`)
        .bind(path)
        .all<{ tag: string }>();

      if (!success) throw new Error(`D1 select failed for ${path}`);

      const tags = this.mergeTagArrays(
        manifest.paths[path],
        results?.map((item) => item.tag)
      );

      debug("tags for path", path, tags);
      return tags;
    } catch (e) {
      error("Failed to get tags by path", e);
      return [];
    }
  }

  public async getByTag(rawTag: string): Promise<string[]> {
    const { isDisabled, db, table } = this.getConfig();
    if (isDisabled) return [];

    const tag = this.getCacheKey(rawTag);

    try {
      const { success, results } = await db
        .prepare(`SELECT path FROM ${table} WHERE tag = ?`)
        .bind(tag)
        .all<{ path: string }>();

      if (!success) throw new Error(`D1 select failed for ${tag}`);

      const paths = this.mergeTagArrays(
        manifest.tags[tag],
        results?.map((item) => item.path)
      );

      debug("paths for tag", tag, paths);
      return paths;
    } catch (e) {
      error("Failed to get by tag", e);
      return [];
    }
  }

  public async getLastModified(path: string, lastModified?: number): Promise<number> {
    const { isDisabled, db, table } = this.getConfig();
    if (isDisabled) return lastModified ?? Date.now();

    try {
      const { success, results } = await db
        .prepare(`SELECT tag FROM ${table} WHERE path = ? AND revalidatedAt > ?`)
        .bind(this.getCacheKey(path), lastModified ?? 0)
        .all<{ tag: string }>();

      if (!success) throw new Error(`D1 select failed for ${path} - ${lastModified ?? 0}`);

      const tags = results?.map((item) => this.removeBuildId(item.tag)) ?? [];
      debug("revalidatedTags", tags);
      return tags.length > 0 ? -1 : (lastModified ?? Date.now());
    } catch (e) {
      error("Failed to get revalidated tags", e);
      return lastModified ?? Date.now();
    }
  }

  public async writeTags(tags: { tag: string; path: string; revalidatedAt?: number }[]): Promise<void> {
    const { isDisabled, db, table } = this.getConfig();
    if (isDisabled || tags.length === 0) return;

    try {
      const results = await db.batch(
        tags.map(({ tag, path, revalidatedAt }) =>
          db
            .prepare(`INSERT INTO ${table} (tag, path, revalidatedAt) VALUES(?, ?, ?)`)
            .bind(this.getCacheKey(tag), this.getCacheKey(path), revalidatedAt ?? Date.now())
        )
      );

      const failedResults = results.filter((res) => !res.success);

      if (failedResults.length > 0) {
        throw new Error(`${failedResults.length} tags failed to write`);
      }
    } catch (e) {
      error("Failed to batch write tags", e);
    }
  }

  private getConfig() {
    const cfEnv = getCloudflareContext().env;
    const db = cfEnv.NEXT_CACHE_D1;
    const table = cfEnv.NEXT_CACHE_D1_TABLE ?? "tags";

    if (!db) debug("No D1 database found");

    const isDisabled = !!(globalThis as unknown as { openNextConfig: OpenNextConfig }).openNextConfig
      .dangerous?.disableTagCache;

    if (!db || isDisabled) {
      return { isDisabled: true as const };
    }

    return { isDisabled: false as const, db, table };
  }

  protected removeBuildId(key: string) {
    return key.replace(`${this.getBuildId()}/`, "");
  }

  protected getCacheKey(key: string) {
    return `${this.getBuildId()}/${key}`.replaceAll("//", "/");
  }

  protected getBuildId() {
    return process.env.NEXT_BUILD_ID ?? "no-build-id";
  }

  protected mergeTagArrays(...arrays: (string[] | undefined)[]) {
    const set = new Set<string>();

    for (const arr of arrays) {
      arr?.forEach((v) => set.add(this.removeBuildId(v)));
    }

    return [...set.values()];
  }
}

export default new D1TagCache();
