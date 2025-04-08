import { error } from "@opennextjs/aws/adapters/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";
import { RecoverableError } from "@opennextjs/aws/utils/error.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID } from "../internal.js";

export const NAME = "d1-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_D1";

export class D1NextModeTagCache implements NextModeTagCache {
  readonly mode = "nextMode" as const;
  readonly name = NAME;

  async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
    const { isDisabled, db } = this.getConfig();
    if (isDisabled) return false;
    try {
      const result = await db
        .prepare(
          `SELECT 1 FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")}) AND revalidatedAt > ? LIMIT 1`
        )
        .bind(...tags.map((tag) => this.getCacheKey(tag)), lastModified ?? Date.now())
        .raw();

      return result.length > 0;
    } catch (e) {
      error(e);
      // By default we don't want to crash here, so we return false
      // We still log the error though so we can debug it
      return false;
    }
  }

  async writeTags(tags: string[]): Promise<void> {
    const { isDisabled, db } = this.getConfig();
    if (isDisabled) return Promise.resolve();
    const result = await db.batch(
      tags.map((tag) =>
        db
          .prepare(`INSERT INTO revalidations (tag, revalidatedAt) VALUES (?, ?)`)
          .bind(this.getCacheKey(tag), Date.now())
      )
    );
    if (!result) throw new RecoverableError(`D1 insert failed for ${tags}`);
  }

  private getConfig() {
    const db = getCloudflareContext().env[BINDING_NAME];

    if (!db) debugCache("No D1 database found");

    const isDisabled = !!(globalThis as unknown as { openNextConfig: OpenNextConfig }).openNextConfig
      .dangerous?.disableTagCache;

    return !db || isDisabled
      ? { isDisabled: true as const }
      : {
          isDisabled: false as const,
          db,
        };
  }

  protected removeBuildId(key: string) {
    return key.replace(`${this.getBuildId()}/`, "");
  }

  protected getCacheKey(key: string) {
    return `${this.getBuildId()}/${key}`.replaceAll("//", "/");
  }

  protected getBuildId() {
    return process.env.NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
  }
}

export default new D1NextModeTagCache();
