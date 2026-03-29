import { error } from "@opennextjs/aws/adapters/logger.js";
import type { NextModeTagCache, NextModeTagCacheWriteInput } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, isPurgeCacheEnabled, purgeCacheByTags } from "../internal.js";

export const NAME = "kv-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_KV";

/**
 * Stored value shape for KV entries.
 * - Old format: a plain number (the revalidatedAt timestamp) — stored as `String(nowMs)`, reads back as a number via `type:"json"`.
 * - New format: a JSON object with full tag data.
 */
type KVTagValue = number | { revalidatedAt: number; stale?: number | null; expiry?: number | null };

function getRevalidatedAt(value: KVTagValue): number {
	return typeof value === "number" ? value : (value.revalidatedAt ?? 0);
}

function getStale(value: KVTagValue): number | null {
	// Backward compat: old format stored a plain number meaning revalidatedAt = stale
	return typeof value === "number" ? value : (value.stale ?? null);
}

function getExpiry(value: KVTagValue): number | null {
	return typeof value === "number" ? null : (value.expiry ?? null);
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
			const keys = tags.map((tag) => this.getCacheKey(tag));
			const result: Map<string, KVTagValue | null> = await kv.get(keys, { type: "json" });

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

	async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
		const revalidated = (await this.#getLastRevalidated(tags)) > (lastModified ?? Date.now());
		debugCache(
			"KVNextModeTagCache",
			`hasBeenRevalidated tags=${tags} lastModified=${lastModified} -> ${revalidated}`
		);
		return revalidated;
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
					const value: KVTagValue = { revalidatedAt: stale, stale, expiry: tag.expiry ?? null };
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

	async hasBeenStale(tags: string[], lastModified?: number): Promise<boolean> {
		const kv = this.getKv();
		if (!kv || tags.length === 0) return false;

		try {
			const keys = tags.map((tag) => this.getCacheKey(tag));
			const now = Date.now();
			const result: Map<string, KVTagValue | null> = await kv.get(keys, { type: "json" });

			const hasStale = [...result.values()].some((v) => {
				if (v == null) return false;
				const stale = getStale(v);
				if (stale == null || stale <= (lastModified ?? now)) return false;
				const expiry = getExpiry(v);
				return expiry == null || expiry > now;
			});

			debugCache("KVNextModeTagCache", `hasBeenStale tags=${tags} lastModified=${lastModified} -> ${hasStale}`);
			return hasStale;
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
		return process.env.NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
	}
}

export default new KVNextModeTagCache();
