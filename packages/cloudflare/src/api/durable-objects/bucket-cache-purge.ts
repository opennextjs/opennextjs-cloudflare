import { DurableObject } from "cloudflare:workers";

import { internalPurgeCacheByTags } from "../overrides/internal.js";

const DEFAULT_BUFFER_TIME_IN_SECONDS = 5;
// https://developers.cloudflare.com/cache/how-to/purge-cache/#hostname-tag-prefix-url-and-purge-everything-limits
const MAX_NUMBER_OF_TAGS_PER_PURGE = 100;

/** Determines whether the alarm should load another batch or request a retry. */
export type CachePurgeAction = "continue" | "retry";

/**
 * Provides the cache purge buffering and alarm lifecycle.
 *
 * Subclasses define their storage schema, batch representation, purge execution,
 * and settlement behavior through protected hooks. Storage initialization is
 * deferred until subclass fields are initialized and gates incoming events.
 *
 * @typeParam Batch Opaque unit of work loaded from the subclass's storage schema.
 * @typeParam Result Purge execution result consumed when settling a batch.
 */
export abstract class BucketCachePurgeBase<Batch, Result> extends DurableObject<CloudflareEnv> {
	/**
	 * Delay before the first buffered purge batch is processed.
	 *
	 * This uses `NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS` when configured and
	 * defaults to five seconds.
	 */
	bufferTimeInSeconds: number;

	private storageInitialization: Promise<void> | undefined;

	/**
	 * Creates a cache purge Durable Object.
	 *
	 * Storage initialization is deferred by one microtask so overridable methods do
	 * not run before subclass fields are initialized. The input gate prevents events
	 * from running until initialization completes.
	 *
	 * @param state Durable Object state and storage access.
	 * @param env Cloudflare environment containing cache purge configuration.
	 */
	constructor(state: DurableObjectState, env: CloudflareEnv) {
		super(state, env);
		this.bufferTimeInSeconds = env.NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS
			? parseInt(env.NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS)
			: DEFAULT_BUFFER_TIME_IN_SECONDS;

		state.blockConcurrencyWhile(async () => {
			// Wait for the subclass constructor to initialize its fields before calling its initializeStorage override.
			// blockConcurrencyWhile prevents requests and alarms from running in the meantime.
			await Promise.resolve();
			await this.ensureStorageInitialized();
		});
	}

	/**
	 * Initializes the storage required by this cache purge implementation.
	 *
	 * This hook runs before any other lifecycle hook. Successful initialization is
	 * memoized for the Durable Object instance, while failed initialization can be
	 * retried. Implementations should make schema creation idempotent because a new
	 * instance can initialize the same persistent storage after eviction.
	 *
	 * @returns A promise that resolves when storage is ready.
	 * @throws When storage initialization fails.
	 */
	protected abstract initializeStorage(): Promise<void>;

	/**
	 * Persists incoming cache tags in the implementation's queue.
	 *
	 * Implementations are responsible for any required deduplication.
	 *
	 * @param tags Cache tags to enqueue.
	 * @returns A promise that resolves after the tags are persisted.
	 * @throws When the tags cannot be persisted.
	 */
	protected abstract enqueueTags(tags: string[]): Promise<void>;

	/**
	 * Loads the next purge batch from storage.
	 *
	 * Implementations can prioritize retry state or other work represented by their
	 * schema. Returning `undefined` completes the current alarm invocation.
	 *
	 * @param limit Maximum number of new cache tags to include when applicable.
	 * @returns The next opaque batch, or `undefined` when no work remains.
	 * @throws When the next batch cannot be loaded.
	 */
	protected abstract loadNextBatch(limit: number): Promise<Batch | undefined>;

	/**
	 * Executes one cache purge batch.
	 *
	 * Implementations must be idempotent because alarms provide at-least-once
	 * execution and the same batch can run more than once.
	 *
	 * @param batch Opaque batch returned by `loadNextBatch`.
	 * @returns The execution result passed to `settleBatch`.
	 * @throws When execution should fail without settling the current batch.
	 */
	protected abstract executePurge(batch: Batch): Promise<Result>;

	/**
	 * Persists the outcome of an executed purge batch.
	 *
	 * This hook can delete completed work, move partial failures into retry storage,
	 * or retain state. Returning `retry` fails the alarm after settlement so the
	 * platform can retry it; returning `continue` loads another batch.
	 *
	 * @param batch Batch that was executed.
	 * @param result Result returned by `executePurge`.
	 * @returns Whether the alarm should continue draining or request a retry.
	 * @throws When the result cannot be persisted safely.
	 */
	protected abstract settleBatch(batch: Batch, result: Result): Promise<CachePurgeAction>;

	/**
	 * Adds cache tags to the buffered purge queue.
	 *
	 * An alarm is scheduled after the configured buffer delay only when no alarm is
	 * already pending.
	 *
	 * @param tags Cache tags to enqueue for purging.
	 * @returns A promise that resolves after the tags are stored and an alarm is scheduled if needed.
	 * @throws When initialization, persistence, or alarm scheduling fails.
	 */
	async purgeCacheByTags(tags: string[]): Promise<void> {
		await this.ensureStorageInitialized();
		await this.enqueueTags(tags);

		const nextAlarm = await this.ctx.storage.getAlarm();
		if (!nextAlarm) {
			await this.ctx.storage.setAlarm(Date.now() + this.bufferTimeInSeconds * 1000);
		}
	}

	/**
	 * Processes buffered cache tags when the Durable Object alarm fires.
	 *
	 * The alarm repeatedly loads, executes, and settles batches until no work remains.
	 * A retry settlement or thrown hook error retains whatever work the implementation
	 * leaves in storage and fails the alarm so the platform can retry it.
	 *
	 * @returns A promise that resolves after all available batches are processed.
	 * @throws When a hook throws or settlement requests an alarm retry.
	 */
	override async alarm(): Promise<void> {
		await this.ensureStorageInitialized();

		while (true) {
			const batch = await this.loadNextBatch(MAX_NUMBER_OF_TAGS_PER_PURGE);
			if (batch === undefined) {
				return;
			}

			const result = await this.executePurge(batch);
			const settlement = await this.settleBatch(batch, result);
			if (settlement === "retry") {
				throw new Error("Cache purge retry requested");
			}
		}
	}

	/**
	 * Coordinates storage initialization for the current Durable Object instance.
	 *
	 * The promise is memoized before it is awaited so concurrent events share the same
	 * initialization work. A rejected promise is cleared so a later event can retry.
	 *
	 * @returns A promise that resolves when storage is ready.
	 * @throws When `initializeStorage` rejects.
	 */
	protected async ensureStorageInitialized(): Promise<void> {
		const initialization = (this.storageInitialization ??= this.initializeStorage());
		try {
			await initialization;
		} catch (error) {
			if (this.storageInitialization === initialization) {
				this.storageInitialization = undefined;
			}
			throw error;
		}
	}
}

/**
 * Buffers and batches Cloudflare cache-tag purge requests with the default schema.
 *
 * Tags are deduplicated in a `cache_purge` SQL table and sent to Cloudflare in
 * batches of at most 100. Extend `BucketCachePurgeBase` instead when an alternate
 * schema or settlement workflow is required.
 */
export class BucketCachePurge extends BucketCachePurgeBase<string[], string | void> {
	/**
	 * Creates the default cache-tag queue schema.
	 *
	 * The unique tag index deduplicates invalidations buffered before the alarm runs.
	 *
	 * @returns A promise that resolves after the schema is ready.
	 * @throws When SQL schema initialization fails.
	 */
	protected async initializeStorage(): Promise<void> {
		this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS cache_purge (
        tag TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tag_index ON cache_purge (tag);
      `);
	}

	/**
	 * Adds tags to the default SQL queue.
	 *
	 * Existing tags are replaced so each cache tag appears at most once.
	 *
	 * @param tags Cache tags to enqueue.
	 * @returns A promise that resolves after all tags are stored.
	 * @throws When a SQL insert fails.
	 */
	protected async enqueueTags(tags: string[]): Promise<void> {
		for (const tag of tags) {
			this.ctx.storage.sql.exec(
				`
        INSERT OR REPLACE INTO cache_purge (tag)
        VALUES (?)`,
				tag
			);
		}
	}

	/**
	 * Loads the next tag batch from the default SQL queue.
	 *
	 * @param limit Maximum number of tags to load.
	 * @returns The next tag batch, or `undefined` when the queue is empty.
	 * @throws When the SQL query fails.
	 */
	protected async loadNextBatch(limit: number): Promise<string[] | undefined> {
		const tags = this.ctx.storage.sql
			.exec<{ tag: string }>(`SELECT tag FROM cache_purge LIMIT ${limit}`)
			.toArray()
			.map((row) => row.tag);

		return tags.length === 0 ? undefined : tags;
	}

	/**
	 * Purges one tag batch with the default Cloudflare API implementation.
	 *
	 * @param tags Cache tags in the current batch.
	 * @returns The purge status used to settle the batch.
	 */
	protected async executePurge(tags: string[]): Promise<string | void> {
		return internalPurgeCacheByTags(this.env, tags);
	}

	/**
	 * Settles a default tag batch after purge execution.
	 *
	 * Rate-limited batches remain stored and request an alarm retry. Every other
	 * result removes the batch and continues draining the queue.
	 *
	 * @param tags Cache tags in the executed batch.
	 * @param result Purge execution status.
	 * @returns Whether the alarm should continue or request a retry.
	 * @throws When deleting a completed batch fails.
	 */
	protected async settleBatch(tags: string[], result: string | void): Promise<CachePurgeAction> {
		if (result === "rate-limit-exceeded") {
			return "retry";
		}

		this.ctx.storage.sql.exec(
			`DELETE FROM cache_purge WHERE tag IN (${tags.map(() => "?").join(",")})`,
			...tags
		);
		return "continue";
	}
}
