import { DurableObject } from "cloudflare:workers";

import { internalPurgeCacheByTags } from "../overrides/internal";

const DEFAULT_BUFFER_TIME_IN_SECONDS = 5;
// https://developers.cloudflare.com/cache/how-to/purge-cache/#hostname-tag-prefix-url-and-purge-everything-limits
const MAX_NUMBER_OF_TAGS_PER_PURGE = 100;

export class BucketCachePurge extends DurableObject<CloudflareEnv> {
  bufferTimeInSeconds: number;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env);
    this.bufferTimeInSeconds = env.NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS
      ? parseInt(env.NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS)
      : DEFAULT_BUFFER_TIME_IN_SECONDS; // Default buffer time

    // Initialize the sql table if it doesn't exist
    state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS cache_purge (
        tag TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tag_index ON cache_purge (tag);
      `);
    });
  }

  async purgeCacheByTags(tags: string[]) {
    for (const tag of tags) {
      // Insert the tag into the sql table
      this.ctx.storage.sql.exec(
        `
        INSERT OR REPLACE INTO cache_purge (tag)
        VALUES (?)`,
        [tag]
      );
    }
    const nextAlarm = await this.ctx.storage.getAlarm();
    if (!nextAlarm) {
      // Set an alarm to trigger the cache purge
      this.ctx.storage.setAlarm(Date.now() + this.bufferTimeInSeconds * 1000);
    }
  }

  override async alarm() {
    let tags = this.ctx.storage.sql
      .exec<{ tag: string }>(
        `
      SELECT * FROM cache_purge LIMIT ${MAX_NUMBER_OF_TAGS_PER_PURGE}
    `
      )
      .toArray();
    do {
      if (tags.length === 0) {
        // No tags to purge, we can stop
        return;
      }
      const result = await internalPurgeCacheByTags(
        this.env,
        tags.map((row) => row.tag)
      );
      // For every other error, we just remove the tags from the sql table
      // and continue
      if (result === "rate-limit-exceeded") {
        // Rate limit exceeded, we need to wait for the next alarm
        // and try again
        // We throw here to take advantage of the built-in retry
        throw new Error("Rate limit exceeded");
      }

      // Delete the tags from the sql table
      this.ctx.storage.sql.exec(
        `
        DELETE FROM cache_purge
        WHERE tag IN (${tags.map(() => "?").join(",")})
      `,
        tags.map((row) => row.tag)
      );
      if (tags.length < MAX_NUMBER_OF_TAGS_PER_PURGE) {
        // If we have less than MAX_NUMBER_OF_TAGS_PER_PURGE tags, we can stop
        tags = [];
      } else {
        // Otherwise, we need to get the next 100 tags
        tags = this.ctx.storage.sql
          .exec<{ tag: string }>(
            `
          SELECT * FROM cache_purge LIMIT ${MAX_NUMBER_OF_TAGS_PER_PURGE}
        `
          )
          .toArray();
      }
    } while (tags.length >= 0);
  }
}
