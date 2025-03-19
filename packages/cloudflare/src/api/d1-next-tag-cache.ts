import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { RecoverableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "./cloudflare-context.js";
import { DEFAULT_NEXT_CACHE_D1_REVALIDATIONS_TABLE } from "./constants.js";

export class D1NextModeTagCache implements NextModeTagCache {
  readonly mode = "nextMode" as const;
  readonly name = "d1-next-mode-tag-cache";

  async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
    const { isDisabled, db, tables } = this.getConfig();
    if (isDisabled) return false;
    try {
      const result = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM ${JSON.stringify(tables.revalidations)} WHERE tag IN (${tags.map(() => "?").join(", ")}) AND revalidatedAt > ? LIMIT 1`
        )
        .bind(...tags.map((tag) => this.getCacheKey(tag)), lastModified ?? Date.now())
        .first<{ cnt: number }>();
      if (!result) throw new RecoverableError(`D1 select failed for ${tags}`);

      return result.cnt > 0;
    } catch (e) {
      error(e);
      // By default we don't want to crash here, so we return false
      // We still log the error though so we can debug it
      return false;
    }
  }

  async writeTags(tags: string[]): Promise<void> {
    const { isDisabled, db, tables } = this.getConfig();
    if (isDisabled) return Promise.resolve();
    const result = await db.batch(
      tags.map((tag) =>
        db
          .prepare(`INSERT INTO ${JSON.stringify(tables.revalidations)} (tag, revalidatedAt) VALUES (?, ?)`)
          .bind(this.getCacheKey(tag), Date.now())
      )
    );
    if (!result) throw new RecoverableError(`D1 insert failed for ${tags}`);
  }

  private getConfig() {
    const cfEnv = getCloudflareContext().env;
    const db = cfEnv.NEXT_CACHE_D1;

    if (!db) debug("No D1 database found");

    const isDisabled = !!(globalThis as unknown as { openNextConfig: OpenNextConfig }).openNextConfig
      .dangerous?.disableTagCache;

    if (!db || isDisabled) {
      return { isDisabled: true as const };
    }

    return {
      isDisabled: false as const,
      db,
      tables: {
        revalidations: cfEnv.NEXT_CACHE_D1_REVALIDATIONS_TABLE ?? DEFAULT_NEXT_CACHE_D1_REVALIDATIONS_TABLE,
      },
    };
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
}

export default new D1NextModeTagCache();
