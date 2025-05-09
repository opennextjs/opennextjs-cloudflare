import { DurableObject } from "cloudflare:workers";

import { internalPurgeCacheByTags } from "../overrides/internal";

const DEFAULT_BUFFER_TIME = 5; // seconds

export class BucketCachePurge extends DurableObject<CloudflareEnv> {
  bufferTimeInSeconds: number;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env);
    this.bufferTimeInSeconds = env.CACHE_BUFFER_TIME_IN_SECONDS
      ? parseInt(env.CACHE_BUFFER_TIME_IN_SECONDS)
      : DEFAULT_BUFFER_TIME; // Default buffer time

    // Initialize the sql table if it doesn't exist
    state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS cache_purge (
        tag TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tag_index ON cache_purge (tag);
      `);
    })
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
      SELECT * FROM cache_purge LIMIT 100
    `
      )
      .toArray();
    if (tags.length === 0) {
      // No tags to purge, we can stop
      // It shouldn't happen, but just in case
      return;
    }
    do {
      await internalPurgeCacheByTags(
        this.env,
        tags.map((row) => row.tag)
      );
      // Delete the tags from the sql table
      this.ctx.storage.sql.exec(
        `
        DELETE FROM cache_purge
        WHERE tag IN (${tags.map(() => "?").join(",")})
      `,
        tags.map((row) => row.tag)
      );
      if (tags.length < 100) {
        // If we have less than 100 tags, we can stop
        tags = [];
      } else {
        // Otherwise, we need to get the next 100 tags
        tags = this.ctx.storage.sql
          .exec<{ tag: string }>(
            `
          SELECT * FROM cache_purge LIMIT 100
        `
          )
          .toArray();
      }
    } while (tags.length > 0);
  }
}
