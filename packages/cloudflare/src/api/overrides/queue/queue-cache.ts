import { error } from "@opennextjs/aws/adapters/logger.js";
import type { Queue, QueueMessage } from "@opennextjs/aws/types/overrides";

interface QueueCachingOptions {
	/**
	 * The TTL for the regional cache in seconds.
	 * @default 5
	 */
	regionalCacheTtlSec?: number;

	/**
	 * Whether to wait for the queue ack before returning.
	 * When set to false, the cache will be populated asap and the queue will be called after.
	 * When set to true, the cache will be populated only after the queue ack is received.
	 * @default false
	 */
	waitForQueueAck?: boolean;
}

const DEFAULT_QUEUE_CACHE_TTL_SEC = 5;

class QueueCache implements Queue {
	readonly name;
	readonly regionalCacheTtlSec: number;
	readonly waitForQueueAck: boolean;
	cache: Cache | undefined;
	// Local mapping from key to insertedAtSec
	localCache: Map<string, number> = new Map();

	constructor(
		private originalQueue: Queue,
		options: QueueCachingOptions
	) {
		this.name = `cached-${originalQueue.name}`;
		this.regionalCacheTtlSec = options.regionalCacheTtlSec ?? DEFAULT_QUEUE_CACHE_TTL_SEC;
		this.waitForQueueAck = options.waitForQueueAck ?? false;
	}

	async send(msg: QueueMessage) {
		try {
			const isCached = await this.isInCache(msg);
			if (isCached) {
				return;
			}
			if (!this.waitForQueueAck) {
				await this.putToCache(msg);
				await this.originalQueue.send(msg);
			} else {
				await this.originalQueue.send(msg);
				await this.putToCache(msg);
			}
		} catch (e) {
			error("Error sending message to queue", e);
		} finally {
			this.clearLocalCache();
		}
	}

	private async getCache() {
		if (!this.cache) {
			this.cache = await caches.open("durable-queue");
		}
		return this.cache;
	}

	private getCacheUrlString(msg: QueueMessage) {
		return `queue/${msg.MessageGroupId}/${msg.MessageDeduplicationId}`;
	}

	private getCacheKey(msg: QueueMessage) {
		return "http://local.cache" + this.getCacheUrlString(msg);
	}

	private async putToCache(msg: QueueMessage) {
		this.localCache.set(this.getCacheUrlString(msg), Date.now());
		const cacheKey = this.getCacheKey(msg);
		const cache = await this.getCache();
		await cache.put(
			cacheKey,
			new Response(null, {
				status: 200,
				headers: {
					"Cache-Control": `max-age=${this.regionalCacheTtlSec}`,
					// Tag cache is set to the value of the soft tag assigned by Next.js
					// This way you can invalidate this cache as well as any other regional cache
					"Cache-Tag": `_N_T_/${msg.MessageBody.url}`,
				},
			})
		);
	}

	private async isInCache(msg: QueueMessage) {
		if (this.localCache.has(this.getCacheUrlString(msg))) {
			const insertedAt = this.localCache.get(this.getCacheUrlString(msg))!;
			if (Date.now() - insertedAt < this.regionalCacheTtlSec * 1000) {
				return true;
			}
			this.localCache.delete(this.getCacheUrlString(msg));
			return false;
		}
		const cacheKey = this.getCacheKey(msg);
		const cache = await this.getCache();
		const cachedResponse = await cache.match(cacheKey);
		if (cachedResponse) {
			return true;
		}
	}

	/**
	 * Remove any value older than the TTL from the local cache
	 */
	private clearLocalCache() {
		const insertAtSecMax = Date.now() - this.regionalCacheTtlSec * 1000;
		for (const [key, insertAtSec] of this.localCache.entries()) {
			if (insertAtSec < insertAtSecMax) {
				this.localCache.delete(key);
			}
		}
	}
}

export default (originalQueue: Queue, opts: QueueCachingOptions = {}) => new QueueCache(originalQueue, opts);
