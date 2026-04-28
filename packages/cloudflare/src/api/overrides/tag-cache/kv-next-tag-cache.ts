import { error } from "@opennextjs/aws/adapters/logger.js";
import type { NextModeTagCache, NextModeTagCacheWriteInput } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, isPurgeCacheEnabled, purgeCacheByTags } from "../internal.js";

export const NAME = "kv-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_KV";

/**
 * Stored value shape for KV entries.
 */
type KVTagValue =
	// Old format (<v1.19)
	// A plain number (the revalidatedAt timestamp in ms) — stored as `String(nowMs)`, reads back as a number via `type:"json"`.
	| number
	// New format (>=v1.19): a JSON object with full tag data.
	// - revalidatedAt: timestamp in ms of the last revalidation
	// - stale: timestamp in ms when the tag becomes stale
	// - expire: timestamp in ms when the tag expires
	| { revalidatedAt: number; stale?: number | null; expire?: number | null };

function getRevalidatedAt(value: KVTagValue): number {
	return typeof value === "number" ? value : (value.revalidatedAt ?? 0);
}

function getStale(value: KVTagValue): number | null {
	// Backward compat: old format stored a plain number meaning revalidatedAt = stale
	return typeof value === "number" ? value : (value.stale ?? null);
}

function getExpire(value: KVTagValue): number | null {
	return typeof value === "number" ? null : (value.expire ?? null);
}

/**
 * Tag Cache based on a KV namespace
 *
 * Warning:
 * This implementation is considered experimental for now.
 * KV is eventually consistent and can take up to 60s to reflect the last write.
 * This means that:
 * - revalidations can take up to 60s to apply
 * - when a page depends on multiple tags they can be inconsistent for up to 60s.
 *   It also means that cached data could be outdated for one tag when other tags
 *   are revalidated resulting in the page being generated based on outdated data.
 */
export class KVNextModeTagCache implements NextModeTagCache {
	readonly mode = "nextMode" as const;
	readonly name = NAME;

	async getLastRevalidated(tags: string[]): Promise<number> {
		const timeMs = await this.#getLastRevalidated(tags);
		debugCache("KVNextModeTagCache", `getLastRevalidated tags=${tags} -> time=${timeMs}`);
		return timeMs;
	}

	/**
	 * Implementation of `getLastRevalidated`.
	 *
	 * This implementation is separated so that `hasBeenRevalidated` do not include logs from `getLastRevalidated`.
	 */
	async #getLastRevalidated(tags: string[]): Promise<number> {
		const kv = this.getKv();
		if (!kv || tags.length === 0) {
			return 0;
		}

		try {
			const result = await this.#resolveTagValues(tags, kv);

			const revalidations = [...result.values()]
				.filter((v): v is KVTagValue => v != null)
				.map(getRevalidatedAt);
			return revalidations.length === 0 ? 0 : Math.max(...revalidations);
		} catch (e) {
			// By default we don't want to crash here, so we return false
			// We still log the error though so we can debug it
			error(e);
			return 0;
		}
	}

	/**
	 * Resolves tag values from the per-request in-memory cache, falling back to KV for any misses.
	 * Results are stored back into the request cache so repeated calls within the same request
	 * avoid duplicate KV fetches.
	 */
	async #resolveTagValues(tags: string[], kv: KVNamespace): Promise<Map<string, KVTagValue | null>> {
		const result = new Map<string, KVTagValue | null>();
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
			const kvKeys = uncachedTags.map((tag) => this.getCacheKey(tag));
			const fetched: Map<string, KVTagValue | null> = await kv.get(kvKeys, { type: "json" });
			for (const tag of uncachedTags) {
				const value = fetched.get(this.getCacheKey(tag)) ?? null;
				itemsCache?.set(tag, value);
				result.set(tag, value);
			}
		}

		return result;
	}

	async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
		const kv = this.getKv();
		if (!kv || tags.length === 0) {
			return false;
		}
		try {
			const now = Date.now();
			const result = await this.#resolveTagValues(tags, kv);
			const revalidated = [...result.values()].some((v) => {
				if (v == null) return false;
				const expire = getExpire(v);
				if (expire != null) return expire <= now && expire > (lastModified ?? 0);
				return getRevalidatedAt(v) > (lastModified ?? now);
			});
			debugCache(
				"KVNextModeTagCache",
				`hasBeenRevalidated tags=${tags} lastModified=${lastModified} -> ${revalidated}`
			);
			return revalidated;
		} catch (e) {
			error(e);
			return false;
		}
	}

	async writeTags(tags: NextModeTagCacheWriteInput[]): Promise<void> {
		const kv = this.getKv();
		if (!kv || tags.length === 0) {
			return Promise.resolve();
		}

		const nowMs = Date.now();

		await Promise.all(
			tags.map(async (tag) => {
				if (typeof tag === "string") {
					// Old format: store plain number string for backward compat
					await kv.put(this.getCacheKey(tag), String(nowMs));
				} else {
					const stale = tag.stale ?? nowMs;
					const value: KVTagValue = { revalidatedAt: stale, stale, expire: tag.expire ?? null };
					await kv.put(this.getCacheKey(tag.tag), JSON.stringify(value));
				}
			})
		);

		const tagStrings = tags.map((t) => (typeof t === "string" ? t : t.tag));
		debugCache("KVNextModeTagCache", `writeTags tags=${tagStrings} time=${nowMs}`);

		// TODO: See https://github.com/opennextjs/opennextjs-aws/issues/986
		if (isPurgeCacheEnabled()) {
			await purgeCacheByTags(tagStrings);
		}
	}

	async isStale(tags: string[], lastModified?: number): Promise<boolean> {
		const kv = this.getKv();
		if (!kv || tags.length === 0) return false;

		try {
			const now = Date.now();
			const result = await this.#resolveTagValues(tags, kv);

			const isStale = [...result.values()].some((v) => {
				if (v == null) return false;
				const stale = getStale(v);
				const expire = getExpire(v);
				// A tag is stale when both its stale timestamp and its revalidatedAt are newer than the page.
				// revalidatedAt > lastModified ensures the revalidation that set this stale window happened
				// after the page was generated, preventing a stale signal from a previous ISR cycle.
				const lastModifiedOrNow = lastModified ?? now;
				const isInStaleWindow =
					stale != null && getRevalidatedAt(v) > lastModifiedOrNow && lastModifiedOrNow <= stale;
				if (!isInStaleWindow) return false;
				return expire == null || expire > now;
			});

			debugCache("KVNextModeTagCache", `isStale tags=${tags} lastModified=${lastModified} -> ${isStale}`);
			return isStale;
		} catch (e) {
			error(e);
			return false;
		}
	}

	/**
	 * Returns the KV namespace when it exists and tag cache is not disabled.
	 *
	 * @returns KV namespace or undefined
	 */
	private getKv(): KVNamespace | undefined {
		const kv = getCloudflareContext().env[BINDING_NAME];

		if (!kv) {
			error(`No KV binding ${BINDING_NAME} found`);
			return undefined;
		}

		const isDisabled = Boolean(globalThis.openNextConfig.dangerous?.disableTagCache);

		return isDisabled ? undefined : kv;
	}

	protected getCacheKey(key: string) {
		return `${this.getBuildId()}/${key}`.replaceAll("//", "/");
	}

	protected getBuildId() {
		return process.env.OPEN_NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
	}

	/**
	 * @returns request scoped in-memory cache for tag values, or undefined if ALS is not available.
	 */
	protected getItemsCache() {
		const store = globalThis.__openNextAls.getStore();
		return store?.requestCache.getOrCreate<string, KVTagValue | null>("kv-nextMode:tagItems");
	}
}

export default new KVNextModeTagCache();
