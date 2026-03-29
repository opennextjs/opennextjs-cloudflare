import { error } from "@opennextjs/aws/adapters/logger.js";
import type { NextModeTagCache, NextModeTagCacheWriteInput } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, isPurgeCacheEnabled, purgeCacheByTags } from "../internal.js";

export const NAME = "d1-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_D1";

export class D1NextModeTagCache implements NextModeTagCache {
	readonly mode = "nextMode" as const;
	readonly name = NAME;

	async getLastRevalidated(tags: string[]): Promise<number> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) {
			return 0;
		}
		try {
			const result = await db
				.prepare(
					`SELECT MAX(revalidatedAt) AS time FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")})`
				)
				.bind(...tags.map((tag) => this.getCacheKey(tag)))
				.run();

			const timeMs = (result.results[0]?.time ?? 0) as number;
			debugCache("D1NextModeTagCache", `getLastRevalidated tags=${tags} -> ${timeMs}`);
			return timeMs;
		} catch (e) {
			// By default we don't want to crash here, so we return false
			// We still log the error though so we can debug it
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
			const result = await db
				.prepare(
					`SELECT 1 FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")}) AND ((expiry IS NOT NULL AND expiry <= ? AND expiry > ?) OR (expiry IS NULL AND revalidatedAt > ?)) LIMIT 1`
				)
				.bind(...tags.map((tag) => this.getCacheKey(tag)), now, lastModified ?? 0, lastModified ?? now)
				.raw();

			const revalidated = result.length > 0;
			debugCache(
				"D1NextModeTagCache",
				`hasBeenRevalidated tags=${tags} at=${lastModified} -> ${revalidated}`
			);
			return revalidated;
		} catch (e) {
			error(e);
			// By default we don't want to crash here, so we return false
			// We still log the error though so we can debug it
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
				const expiry = typeof tag === "string" ? null : (tag.expiry ?? null);
				return db
					.prepare(
						`INSERT INTO revalidations (tag, revalidatedAt, stale, expiry) VALUES (?, ?, ?, ?)`
					)
					.bind(this.getCacheKey(tagStr), stale, stale, expiry);
			})
		);

		const tagStrings = tags.map((t) => (typeof t === "string" ? t : t.tag));
		debugCache("D1NextModeTagCache", `writeTags tags=${tagStrings} time=${nowMs}`);

		// TODO: See https://github.com/opennextjs/opennextjs-aws/issues/986
		if (isPurgeCacheEnabled()) {
			await purgeCacheByTags(tagStrings);
		}
	}

	async hasBeenStale(tags: string[], lastModified?: number): Promise<boolean> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) {
			return false;
		}
		try {
			const now = Date.now();
			const result = await db
				.prepare(
					`SELECT 1 FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")}) AND stale > ? AND (expiry IS NULL OR expiry > ?) LIMIT 1`
				)
				.bind(...tags.map((tag) => this.getCacheKey(tag)), lastModified ?? now, now)
				.raw();

			const hasStale = result.length > 0;
			debugCache("D1NextModeTagCache", `hasBeenStale tags=${tags} at=${lastModified} -> ${hasStale}`);
			return hasStale;
		} catch (e) {
			error(e);
			return false;
		}
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
}

export default new D1NextModeTagCache();
