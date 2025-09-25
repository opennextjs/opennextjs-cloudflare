import { error } from "@opennextjs/aws/adapters/logger.js";
import type { NextModeTagCache } from "@opennextjs/aws/types/overrides.js";

import { getCloudflareContext } from "../../cloudflare-context.js";
import { FALLBACK_BUILD_ID, purgeCacheByTags } from "../internal.js";

export const NAME = "kv-next-mode-tag-cache";

export const BINDING_NAME = "NEXT_TAG_CACHE_KV";

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
		const kv = this.getKv();
		if (!kv) {
			return 0;
		}

		try {
			const keys = tags.map((tag) => this.getCacheKey(tag));
			// Use the `json` type to get back numbers/null
			const result: Map<string, number | null> = await kv.get(keys, { type: "json" });

			const revalidations = [...result.values()].filter((v) => v != null);

			return revalidations.length === 0 ? 0 : Math.max(...revalidations);
		} catch (e) {
			// By default we don't want to crash here, so we return false
			// We still log the error though so we can debug it
			error(e);
			return 0;
		}
	}

	async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
		return (await this.getLastRevalidated(tags)) > (lastModified ?? Date.now());
	}

	async writeTags(tags: string[]): Promise<void> {
		const kv = this.getKv();
		if (!kv || tags.length === 0) {
			return Promise.resolve();
		}

		const timeMs = String(Date.now());

		await Promise.all(
			tags.map(async (tag) => {
				await kv.put(this.getCacheKey(tag), timeMs);
			})
		);

		// TODO: See https://github.com/opennextjs/opennextjs-aws/issues/986
		await purgeCacheByTags(tags);
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
