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

  async getLastRevalidated(tags: string[]): Promise<number> {
    try {
      const result = this.sql
        .exec(
          `SELECT MAX(revalidatedAt) AS time FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")})`,
          ...tags
        )
        .toArray();
      if (result.length === 0) return 0;
      // We only care about the most recent revalidation
      return result[0]?.time as number;
    } catch (e) {
      console.error(e);
      // By default we don't want to crash here, so we return 0
      return 0;
    }
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
