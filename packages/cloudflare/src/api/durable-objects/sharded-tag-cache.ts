import { DurableObject } from "cloudflare:workers";

import { debugCache } from "../overrides/internal.js";

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

			const timeMs = (result[0]?.time ?? 0) as number;
			debugCache("DOShardedTagCache", `getLastRevalidated tags=${tags} -> time=${timeMs}`);
			return timeMs;
		} catch (e) {
			console.error(e);
			// By default we don't want to crash here, so we return 0
			return 0;
		}
	}

	async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
		const revalidated =
			this.sql
				.exec(
					`SELECT 1 FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")}) AND revalidatedAt > ? LIMIT 1`,
					...tags,
					lastModified ?? Date.now()
				)
				.toArray().length > 0;

		debugCache("DOShardedTagCache", `hasBeenRevalidated tags=${tags} -> revalidated=${revalidated}`);
		return revalidated;
	}

	async writeTags(tags: string[], lastModified: number): Promise<void> {
		debugCache("DOShardedTagCache", `writeTags tags=${tags} time=${lastModified}`);

		tags.forEach((tag) => {
			this.sql.exec(
				`INSERT OR REPLACE INTO revalidations (tag, revalidatedAt) VALUES (?, ?)`,
				tag,
				lastModified
			);
		});
	}

	async getRevalidationTimes(tags: string[]): Promise<Record<string, number>> {
		const result = this.sql
			.exec(
				`SELECT tag, revalidatedAt FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")})`,
				...tags
			)
			.toArray();
		return Object.fromEntries(result.map((row) => [row.tag, row.revalidatedAt]));
	}
}
