import { error } from "@opennextjs/aws/adapters/logger.js";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { debugCache, FALLBACK_BUILD_ID, purgeCacheByTags } from "../internal.js";

export const NAME = "d1-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_D1";

export class D1NextModeTagCache implements NextModeTagCache {
	readonly mode = "nextMode" as const;
	readonly name = NAME;

	async getLastRevalidated(tags: string[]): Promise<number> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled) return 0;
		try {
			const result = await db
				.prepare(
					`SELECT MAX(revalidatedAt) AS time FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")})`
				)
				.bind(...tags.map((tag) => this.getCacheKey(tag)))
				.run();

			if (result.results.length === 0) return 0;
			// We only care about the most recent revalidation
			return (result.results[0]?.time ?? 0) as number;
		} catch (e) {
			// By default we don't want to crash here, so we return false
			// We still log the error though so we can debug it
			error(e);
			return 0;
		}
	}

	async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled) return false;
		try {
			const result = await db
				.prepare(
					`SELECT 1 FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")}) AND revalidatedAt > ? LIMIT 1`
				)
				.bind(...tags.map((tag) => this.getCacheKey(tag)), lastModified ?? Date.now())
				.raw();

			return result.length > 0;
		} catch (e) {
			error(e);
			// By default we don't want to crash here, so we return false
			// We still log the error though so we can debug it
			return false;
		}
	}

	async writeTags(tags: string[]): Promise<void> {
		const { isDisabled, db } = this.getConfig();
		if (isDisabled || tags.length === 0) return Promise.resolve();

		await db.batch(
			tags.map((tag) =>
				db
					.prepare(`INSERT INTO revalidations (tag, revalidatedAt) VALUES (?, ?)`)
					.bind(this.getCacheKey(tag), Date.now())
			)
		);

		// TODO: See https://github.com/opennextjs/opennextjs-aws/issues/986
		await purgeCacheByTags(tags);
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
