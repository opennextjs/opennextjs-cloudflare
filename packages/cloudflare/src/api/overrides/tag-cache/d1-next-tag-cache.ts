import { error } from "@opennextjs/aws/adapters/logger.js";
import type { NextModeTagCache, NextModeTagCacheWriteInput } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, isPurgeCacheEnabled, purgeCacheByTags } from "../internal.js";

export const NAME = "d1-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_D1";

/**
 * Stored value shape for D1 tag entries.
 *
 * - revalidatedAt: timestamp in ms of the last revalidation
 * - stale: timestamp in ms when the tag becomes stale
 * - expire: timestamp in ms when the tag expires (null means no expiry)
 */
type D1TagValue = { revalidatedAt: number; stale: number | null; expire: number | null };

export class D1NextModeTagCache implements NextModeTagCache {
	readonly mode = "nextMode" as const;
	readonly name = NAME;

	async getLastRevalidated(tags: string[]): Promise<number> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) {
			return 0;
		}
		try {
			const result = await this.#resolveTagValues(tags, db);

			const revalidations = [...result.values()]
				.filter((v): v is D1TagValue => v != null)
				.map((v) => v.revalidatedAt);
			const timeMs = revalidations.length === 0 ? 0 : Math.max(...revalidations);
			debugCache("D1NextModeTagCache", `getLastRevalidated tags=${tags} -> ${timeMs}`);
			return timeMs;
		} catch (e) {
			error(e);
			return 0;
		}
	}

	async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) {
			return false;
		}
		try {
			const now = Date.now();
			const result = await this.#resolveTagValues(tags, db);

			const revalidated = [...result.values()].some((v) => {
				if (v == null) return false;
				const { revalidatedAt, expire } = v;
				if (expire != null) return expire <= now && expire > (lastModified ?? 0);
				return revalidatedAt > (lastModified ?? now);
			});

			debugCache(
				"D1NextModeTagCache",
				`hasBeenRevalidated tags=${tags} at=${lastModified} -> ${revalidated}`
			);
			return revalidated;
		} catch (e) {
			error(e);
			return false;
		}
	}

	async writeTags(tags: NextModeTagCacheWriteInput[]): Promise<void> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) return Promise.resolve();

		const nowMs = Date.now();

		await db.batch(
			tags.map((tag) => {
				const tagStr = typeof tag === "string" ? tag : tag.tag;
				const stale = typeof tag === "string" ? nowMs : (tag.stale ?? nowMs);
				const expire = typeof tag === "string" ? null : (tag.expire ?? null);
				return db
					.prepare(`INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)`)
					.bind(this.getCacheKey(tagStr), stale, stale, expire);
			})
		);

		const tagStrings = tags.map((t) => (typeof t === "string" ? t : t.tag));
		debugCache("D1NextModeTagCache", `writeTags tags=${tagStrings} time=${nowMs}`);

		// TODO: See https://github.com/opennextjs/opennextjs-aws/issues/986
		if (isPurgeCacheEnabled()) {
			await purgeCacheByTags(tagStrings);
		}
	}

	async isStale(tags: string[], lastModified?: number): Promise<boolean> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) {
			return false;
		}
		try {
			const now = Date.now();
			const result = await this.#resolveTagValues(tags, db);

			const isStale = [...result.values()].some((v) => {
				if (v == null) return false;
				const { revalidatedAt, stale, expire } = v;
				// A tag is stale when both its stale and revalidatedAt timestamps are newer than the page.
				// revalidatedAt > lastModified ensures the revalidation that set this stale window happened
				// after the page was generated, preventing a stale signal from a previous ISR cycle.
				const lastModifiedOrNow = lastModified ?? now;
				const isInStaleWindow =
					stale != null && revalidatedAt > lastModifiedOrNow && lastModifiedOrNow <= stale;
				if (!isInStaleWindow) return false;
				return expire == null || expire > now;
			});

			debugCache("D1NextModeTagCache", `isStale tags=${tags} at=${lastModified} -> ${isStale}`);
			return isStale;
		} catch (e) {
			error(e);
			return false;
		}
	}

	/**
	 * Resolves tag values from the per-request in-memory cache, falling back to D1 for any misses.
	 *
	 * Results are stored back into the request cache so repeated calls within the same request
	 * avoid duplicate D1 queries.
	 *
	 * @param tags - The tag names to resolve.
	 * @param db - The D1 database binding.
	 * @returns A map of tag name to its D1TagValue (or null if the tag was not found).
	 */
	async #resolveTagValues(tags: string[], db: D1Database): Promise<Map<string, D1TagValue | null>> {
		const result = new Map<string, D1TagValue | null>();
		const uncachedTags: string[] = [];

		const itemsCache = this.getItemsCache();

		for (const tag of tags) {
			if (itemsCache?.has(tag)) {
				result.set(tag, itemsCache.get(tag) ?? null);
			} else {
				uncachedTags.push(tag);
			}
		}

		if (uncachedTags.length > 0) {
			const rows = await db
				.prepare(
					`SELECT tag, revalidatedAt, stale, expire FROM revalidations WHERE tag IN (${uncachedTags.map(() => "?").join(", ")})`
				)
				.bind(...uncachedTags.map((tag) => this.getCacheKey(tag)))
				.raw();

			// Index rows by cache key for lookup.
			const rowsByKey = new Map(rows.map((row) => [row[0] as string, row]));

			for (const tag of uncachedTags) {
				const row = rowsByKey.get(this.getCacheKey(tag));
				const value: D1TagValue | null = row
					? {
							revalidatedAt: (row[1] as number) ?? 0,
							stale: (row[2] as number) ?? null,
							expire: (row[3] as number) ?? null,
						}
					: null;
				itemsCache?.set(tag, value);
				result.set(tag, value);
			}
		}

		return result;
	}

	private getConfig() {
		const db = getCloudflareContext().env[BINDING_NAME];

		if (!db) debugCache("No D1 database found");

		const isDisabled = Boolean(globalThis.openNextConfig.dangerous?.disableTagCache);

		return !db || isDisabled
			? { isDisabled: true as const }
			: {
					isDisabled: false as const,
					db,
				};
	}

	protected getCacheKey(key: string) {
		return `${this.getBuildId()}/${key}`.replaceAll("//", "/");
	}

	protected getBuildId() {
		return process.env.NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
	}

	/**
	 * @returns request scoped in-memory cache for tag values, or undefined if ALS is not available.
	 */
	protected getItemsCache() {
		const store = globalThis.__openNextAls?.getStore();
		return store?.requestCache.getOrCreate<string, D1TagValue | null>("d1-nextMode:tagItems");
	}
}

export default new D1NextModeTagCache();
