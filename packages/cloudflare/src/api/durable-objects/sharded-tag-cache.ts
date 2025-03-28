import { DurableObject } from "cloudflare:workers";

export class DOShardedTagCache extends DurableObject<CloudflareEnv> {
  sql: SqlStorage;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env);
    this.sql = state.storage.sql;
    state.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER)`);
    });
  }

  async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
    return (
      this.sql
        .exec(
          `SELECT 1 FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")}) AND revalidatedAt > ? LIMIT 1`,
          ...tags,
          lastModified ?? Date.now()
        )
        .toArray().length > 0
    );
  }

  async writeTags(tags: string[], lastModified: number): Promise<void> {
    tags.forEach((tag) => {
      this.sql.exec(
        `INSERT OR REPLACE INTO revalidations (tag, revalidatedAt) VALUES (?, ?)`,
        tag,
        lastModified
      );
    });
  }
}
