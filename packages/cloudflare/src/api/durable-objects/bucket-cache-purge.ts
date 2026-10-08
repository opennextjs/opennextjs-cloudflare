import { DurableObject } from "cloudflare:workers";

import { internalPurgeCacheByTags, parseZoneIds, purgeZone } from "../overrides/internal.js";

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

		// Initialize tables if they don't exist
		state.blockConcurrencyWhile(async () => {
			state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS cache_purge (
        tag TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tag_index ON cache_purge (tag);
      CREATE TABLE IF NOT EXISTS pending_purges (
        tag TEXT NOT NULL,
        zone_id TEXT NOT NULL,
        PRIMARY KEY (tag, zone_id)
      );
      `);
		});
	}

	async purgeCacheByTags(tags: string[]) {
		for (const tag of tags) {
			this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO cache_purge (tag) VALUES (?)`, tag);
		}
		const nextAlarm = await this.ctx.storage.getAlarm();
		if (!nextAlarm) {
			// Set an alarm to trigger the cache purge
			this.ctx.storage.setAlarm(Date.now() + this.bufferTimeInSeconds * 1000);
		}
	}

	override async alarm() {
		// Process first any pending retries from a previous rate-limited attempt
		await this.retryPendingPurges();
		// Then process the normal cache_purge queue.
		await this.processCachePurgeQueue();
	}

	/**
	 * Drain the cache_purge table in batches, purging each batch against all
	 * configured zones. On rate-limit, stores the failed (tag, zone_id) pairs
	 * in pending_purges and throws to trigger the built-in retry.
	 */
	private async processCachePurgeQueue(): Promise<void> {
		let tags = this.ctx.storage.sql
			.exec<{ tag: string }>(`SELECT * FROM cache_purge LIMIT ${MAX_NUMBER_OF_TAGS_PER_PURGE}`)
			.toArray();

		do {
			if (tags.length === 0) {
				// No tags to purge, we can stop
				return;
			}

			const tagStrings = tags.map((row) => row.tag);
			const zoneIds = parseZoneIds(this.env);
			const result = await internalPurgeCacheByTags(this.env, tagStrings, zoneIds);

			if (result.status === "rate-limit-exceeded") {
				// Move tags from cache_purge into pending_purges for the rate-limited
				// zones. Deleting from cache_purge first ensures that a concurrent
				// purgeCacheByTags call for the same tag creates a fresh row that the
				// retry cleanup will not accidentally remove.
				this.ctx.storage.sql.exec(
					`DELETE FROM cache_purge WHERE tag IN (${tags.map(() => "?").join(",")})`,
					...tagStrings
				);
				for (const zoneId of result.rateLimitedZones) {
					for (const tag of tagStrings) {
						this.ctx.storage.sql.exec(
							`INSERT OR REPLACE INTO pending_purges (tag, zone_id) VALUES (?, ?)`,
							tag,
							zoneId
						);
					}
				}
				throw new Error("Rate limit exceeded");
			}

			// Delete the purged tags from cache_purge.
			this.ctx.storage.sql.exec(
				`DELETE FROM cache_purge WHERE tag IN (${tags.map(() => "?").join(",")})`,
				...tagStrings
			);

			if (tags.length < MAX_NUMBER_OF_TAGS_PER_PURGE) {
				// If we have less than MAX_NUMBER_OF_TAGS_PER_PURGE tags, we can stop
				tags = [];
			} else {
				// Otherwise, we need to get the next 100 tags
				tags = this.ctx.storage.sql
					.exec<{ tag: string }>(`SELECT * FROM cache_purge LIMIT ${MAX_NUMBER_OF_TAGS_PER_PURGE}`)
					.toArray();
			}
		} while (tags.length > 0);
	}

	/**
	 * Retry (tag, zone_id) pairs that were rate-limited on a previous attempt.
	 *
	 * Each zone receives only the tags that are still pending for it.
	 * Pairs that succeed are removed. If any zone is rate-limited again, the
	 * remaining pairs stay in the table and the method throws to trigger
	 * another built-in retry.
	 */
	private async retryPendingPurges(): Promise<void> {
		const pending = this.ctx.storage.sql
			.exec<{ tag: string; zone_id: string }>(`SELECT * FROM pending_purges`)
			.toArray();

		if (pending.length === 0) {
			// No pending retries from a previous alarm
			return;
		}

		// Group tags by zone so each zone only receives its own pending tags.
		const tagsByZone = new Map<string, string[]>();
		for (const row of pending) {
			let tags = tagsByZone.get(row.zone_id);
			if (!tags) {
				tags = [];
				tagsByZone.set(row.zone_id, tags);
			}
			tags.push(row.tag);
		}

		// Purge each zone in parallel with its own tag set.
		const results = await Promise.all(
			[...tagsByZone.entries()].map(([zoneId, tags]) => purgeZone(this.env, zoneId, tags))
		);

		// Remove succeeded pairs, keep rate-limited ones for the next retry.
		let hasRateLimit = false;
		for (const result of results) {
			if (result.status === "rate-limit-exceeded") {
				hasRateLimit = true;
			} else {
				this.ctx.storage.sql.exec(`DELETE FROM pending_purges WHERE zone_id = ?`, result.zoneId);
			}
		}

		if (hasRateLimit) {
			// Throw to trigger the built-in alarm retry
			throw new Error("Rate limit exceeded");
		}

		// All retries succeeded - clear pending_purges.
		// Tags were already removed from cache_purge when the rate-limit was
		// first recorded, so there is nothing to delete there.
		this.ctx.storage.sql.exec(`DELETE FROM pending_purges`);
	}
}
