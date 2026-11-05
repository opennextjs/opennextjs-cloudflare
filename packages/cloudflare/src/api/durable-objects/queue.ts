import { debug, error, warn } from "@opennextjs/aws/adapters/logger.js";
import type { QueueMessage } from "@opennextjs/aws/types/overrides.js";
import {
	FatalError,
	IgnorableError,
	isOpenNextError,
	RecoverableError,
} from "@opennextjs/aws/utils/error.js";
import { DurableObject } from "cloudflare:workers";

/** Default maximum number of revalidations running at the same time. */
const DEFAULT_MAX_REVALIDATION = 5;
/** Default time in milliseconds after which a revalidation request is aborted. */
const DEFAULT_REVALIDATION_TIMEOUT_MS = 10_000;
/** Default base interval in milliseconds of the exponential backoff between retries. */
const DEFAULT_RETRY_INTERVAL_MS = 2_000;
/** Default maximum number of retries of a failed revalidation. */
const DEFAULT_MAX_RETRIES = 6;

/** A failed revalidation waiting to be retried. */
interface FailedState {
	/** Message of the failed revalidation. */
	msg: QueueMessage;
	/** Number of failed attempts so far. */
	retryCount: number;
	/** Time in milliseconds (epoch) after which the revalidation should be retried. */
	nextAlarmMs: number;
}

/**
 * Durable Object that runs the ISR revalidations sent by the `durable-queue` queue override.
 *
 * A route is revalidated by sending a `HEAD` request to the Worker itself through the
 * `WORKER_SELF_REFERENCE` service binding. Revalidations are deduplicated by `MessageDeduplicationId`
 * and at most `maxRevalidations` of them run at the same time.
 *
 * Failed revalidations are retried from an alarm with an exponential backoff, up to `maxRetries` times.
 *
 * Unless `NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE` is set, SQLite stores:
 * - the failed revalidations (`failed_state` table), so they are restored after a restart;
 * - the time of the last successful revalidation of each route (`sync` table), so messages sent from a
 *   stale copy of an eventually consistent incremental cache are skipped.
 *
 * Rows written by other builds are deleted on startup.
 */
export class DOQueueHandler extends DurableObject<CloudflareEnv> {
	// TODO: handle incremental cache with only eventual consistency (i.e. KV or R2/D1 with the optional cache layer on top)
	/**
	 * Revalidations in progress, keyed by deduplication id.
	 *
	 * Used to dedupe messages and to limit the number of concurrent revalidations.
	 * It is only kept in memory: revalidations run in `waitUntil`, so the Durable Object is expected to
	 * stay alive until they end.
	 */
	ongoingRevalidations = new Map<string, Promise<void>>();

	/** SQLite storage of the Durable Object. */
	sql: SqlStorage;

	/**
	 * Failed revalidations waiting to be retried by the alarm, keyed by deduplication id.
	 *
	 * Messages with a deduplication id in this map are skipped by `revalidate`.
	 * Entries are persisted to the `failed_state` table unless SQLite is disabled.
	 */
	routeInFailedState = new Map<string, FailedState>();

	/** Service binding to the Worker itself, used to send the revalidation requests. */
	service: NonNullable<CloudflareEnv["WORKER_SELF_REFERENCE"]>;

	// Configurable params
	/**
	 * Maximum number of revalidations running at the same time.
	 *
	 * Set with `NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION`, defaults to {@link DEFAULT_MAX_REVALIDATION}.
	 */
	readonly maxRevalidations: number;
	/**
	 * Time in milliseconds after which a revalidation request is aborted.
	 *
	 * Set with `NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS`, defaults to {@link DEFAULT_REVALIDATION_TIMEOUT_MS}.
	 */
	readonly revalidationTimeout: number;
	/**
	 * Base interval in milliseconds of the exponential backoff between retries.
	 *
	 * Set with `NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS`, defaults to {@link DEFAULT_RETRY_INTERVAL_MS}.
	 */
	readonly revalidationRetryInterval: number;
	/**
	 * Maximum number of retries of a failed revalidation.
	 *
	 * Set with `NEXT_CACHE_DO_QUEUE_MAX_RETRIES`, defaults to {@link DEFAULT_MAX_RETRIES}.
	 */
	readonly maxRetries: number;
	/**
	 * Whether SQLite is disabled.
	 *
	 * Set `NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE` to `"true"` to disable it. Failed revalidations are then lost
	 * on restart and messages are never skipped based on the last successful revalidation.
	 */
	readonly disableSQLite: boolean;

	/**
	 * Creates the queue and restores its persisted state.
	 *
	 * The state is restored in `blockConcurrencyWhile`, so no event is handled before it is ready.
	 *
	 * @param ctx Durable Object state and storage.
	 * @param env Cloudflare environment with the service binding and the queue configuration.
	 * @throws {IgnorableError} When the `WORKER_SELF_REFERENCE` service binding is missing.
	 */
	constructor(ctx: DurableObjectState, env: CloudflareEnv) {
		super(ctx, env);
		// If there is no service binding, we throw an error because we can't revalidate without it
		if (!env.WORKER_SELF_REFERENCE) {
			throw new IgnorableError("No service binding for cache revalidation worker");
		}
		this.service = env.WORKER_SELF_REFERENCE;
		this.sql = ctx.storage.sql;

		this.maxRevalidations = env.NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION
			? parseInt(env.NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION)
			: DEFAULT_MAX_REVALIDATION;

		this.revalidationTimeout = env.NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS
			? parseInt(env.NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS)
			: DEFAULT_REVALIDATION_TIMEOUT_MS;

		this.revalidationRetryInterval = env.NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS
			? parseInt(env.NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS)
			: DEFAULT_RETRY_INTERVAL_MS;

		this.maxRetries = env.NEXT_CACHE_DO_QUEUE_MAX_RETRIES
			? parseInt(env.NEXT_CACHE_DO_QUEUE_MAX_RETRIES)
			: DEFAULT_MAX_RETRIES;

		this.disableSQLite = env.NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE === "true";

		// We restore the state
		ctx.blockConcurrencyWhile(async () => {
			debug(`Restoring the state of the durable object`);
			await this.initState();
		});

		debug(`Durable object initialized`);
	}

	/**
	 * Starts the revalidation of a route.
	 *
	 * The message is skipped when a revalidation with the same deduplication id is in progress, when it
	 * is in the failed state (the alarm retries it), or when the route was successfully revalidated after
	 * the message's `lastModified`.
	 *
	 * When `maxRevalidations` revalidations are in progress, waits until one of them ends.
	 * The revalidation then runs in `waitUntil`: the returned promise does not wait for it.
	 *
	 * @param msg Message sent by the queue override.
	 * @returns A promise that resolves once the revalidation is started or skipped.
	 * @throws When a revalidation it waits for rejects (see `executeRevalidation`).
	 */
	async revalidate(msg: QueueMessage) {
		if (this.ongoingRevalidations.size > 2 * this.maxRevalidations) {
			warn(
				`Your durable object has 2 times the maximum number of revalidations (${this.maxRevalidations}) in progress. If this happens often, you should consider increasing the NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION or the number of durable objects with the MAX_REVALIDATE_CONCURRENCY env var.`
			);
		}
		// If there is already an ongoing revalidation, we don't need to revalidate again
		if (this.ongoingRevalidations.has(msg.MessageDeduplicationId)) return;

		// The route is already in a failed state, it will be retried later
		if (this.routeInFailedState.has(msg.MessageDeduplicationId)) return;

		// If the last success is newer than the last modified, it's likely that the regional cache is out of date
		// We don't need to revalidate in this case
		if (this.checkSyncTable(msg)) return;

		if (this.ongoingRevalidations.size >= this.maxRevalidations) {
			debug(
				`The maximum number of revalidations (${this.maxRevalidations}) is reached. Blocking until one of the revalidations finishes.`
			);
			// TODO: need more investigation
			// We don't use `blockConcurrencyWhile` here because it block the whole durable object for 30 seconds
			// if we exceed the max revalidations too fast
			while (this.ongoingRevalidations.size >= this.maxRevalidations) {
				const ongoingRevalidations = this.ongoingRevalidations.values();
				debug(`Waiting for one of the revalidations to finish`);
				await Promise.race(ongoingRevalidations);
			}
		}

		const revalidationPromise = this.executeRevalidation(msg);

		// We store the promise to dedupe the revalidation
		this.ongoingRevalidations.set(msg.MessageDeduplicationId, revalidationPromise);

		this.ctx.waitUntil(revalidationPromise);
	}

	/**
	 * Revalidates a route, then updates the failed state and the sync table.
	 *
	 * Sends a `HEAD` request to the route through the service binding, with the preview mode id inlined
	 * at build time in `x-prerender-revalidate`. The request is aborted after `revalidationTimeout`.
	 *
	 * The outcome depends on the response:
	 * - `200` with `x-nextjs-cache: REVALIDATED`: success, the sync table is updated and the route is
	 *   removed from `routeInFailedState`;
	 * - `200` without it: logged as a `FatalError`, the route is removed from `routeInFailedState`;
	 * - `404`: logged as an `IgnorableError`, the route is removed from `routeInFailedState`;
	 * - `500`: logged as an `IgnorableError`, the route is added to the failed state;
	 * - any other status: logged as a `RecoverableError`, the route is added to the failed state.
	 *
	 * Any other error (network error, timeout, ...) is logged and adds the route to the failed state.
	 * When done, the deduplication id is removed from `ongoingRevalidations` and the response body is
	 * cancelled.
	 *
	 * @param msg Message of the route to revalidate.
	 * @returns A promise that resolves when the revalidation is done.
	 * @throws When adding the route to the failed state fails after an unexpected error.
	 */
	async executeRevalidation(msg: QueueMessage) {
		let response: Response | undefined;
		try {
			debug(`Revalidating ${msg.MessageBody.host}${msg.MessageBody.url}`);
			const {
				MessageBody: { host, url },
			} = msg;
			const protocol = host.includes("localhost") ? "http" : "https";

			response = await this.service.fetch(`${protocol}://${host}${url}`, {
				method: "HEAD",
				headers: {
					// This is defined during build
					"x-prerender-revalidate": process.env.__NEXT_PREVIEW_MODE_ID!,
					"x-isr": "1",
				},
				// This one is kind of problematic, it will always show the wall time of the revalidation to `this.revalidationTimeout`
				signal: AbortSignal.timeout(this.revalidationTimeout),
			});
			// Now we need to handle errors from the fetch
			if (response.status === 200 && response.headers.get("x-nextjs-cache") !== "REVALIDATED") {
				this.routeInFailedState.delete(msg.MessageDeduplicationId);
				throw new FatalError(
					`The revalidation for ${host}${url} cannot be done. This error should never happen.`
				);
			} else if (response.status === 404) {
				// The page is not found, we should not revalidate it
				// We remove the route from the failed state because it might be expected (i.e. a route that was deleted)
				this.routeInFailedState.delete(msg.MessageDeduplicationId);
				throw new IgnorableError(
					`The revalidation for ${host}${url} cannot be done because the page is not found. It's either expected or an error in user code itself`
				);
			} else if (response.status === 500) {
				// A server error occurred, we should retry

				await this.addToFailedState(msg);

				throw new IgnorableError(`Something went wrong while revalidating ${host}${url}`);
			} else if (response.status !== 200) {
				// TODO: check if we need to handle cloudflare specific status codes/errors
				// An unknown error occurred, most likely from something in user code like missing auth in the middleware

				// We probably want to retry in this case as well
				await this.addToFailedState(msg);

				throw new RecoverableError(`An unknown error occurred while revalidating ${host}${url}`);
			}
			// Everything went well, we can update the sync table
			// We use unixepoch here,it also works with Date.now()/1000, but not with Date.now() alone.
			// TODO: This needs to be investigated
			if (!this.disableSQLite) {
				this.sql.exec(
					"INSERT OR REPLACE INTO sync (id, lastSuccess, buildId) VALUES (?, unixepoch(), ?)",
					// We cannot use the deduplication id because it's not unique per route - every time a route is revalidated, the deduplication id is different.
					`${host}${url}`,
					process.env.__OPEN_NEXT_BUILD_ID
				);
			}
			// If everything went well, we can remove the route from the failed state
			this.routeInFailedState.delete(msg.MessageDeduplicationId);
		} catch (e) {
			// Do we want to propagate the error to the calling worker?
			if (!isOpenNextError(e)) {
				await this.addToFailedState(msg);
			}
			error(e);
		} finally {
			this.ongoingRevalidations.delete(msg.MessageDeduplicationId);
			// Cancel the stream when it has not been consumed
			try {
				await response?.body?.cancel();
			} catch {
				// Ignore errors when the stream was actually consumed
			}
		}
	}

	/**
	 * Retries the failed revalidations when the alarm fires.
	 *
	 * Retries, one after the other, every failed revalidation that is due, plus the earliest one that is
	 * not due yet. A retry that fails again is added back to the failed state, which sets a new alarm.
	 *
	 * @returns A promise that resolves when all the retries are done.
	 * @throws When a retry rejects (see `executeRevalidation`).
	 */
	override async alarm() {
		const currentDateTime = Date.now();
		// We fetch the first event that needs to be retried or if the date is expired
		const nextEventToRetry = Array.from(this.routeInFailedState.values())
			.filter(({ nextAlarmMs }) => nextAlarmMs > currentDateTime)
			.sort(({ nextAlarmMs: a }, { nextAlarmMs: b }) => a - b)[0];
		// We also have to check if there are expired events, if the revalidation takes too long, or if the
		const expiredEvents = Array.from(this.routeInFailedState.values()).filter(
			({ nextAlarmMs }) => nextAlarmMs <= currentDateTime
		);
		const allEventsToRetry = nextEventToRetry ? [nextEventToRetry, ...expiredEvents] : expiredEvents;
		for (const event of allEventsToRetry) {
			debug(`Retrying revalidation for ${event.msg.MessageBody.host}${event.msg.MessageBody.url}`);
			await this.executeRevalidation(event.msg);
		}
	}

	/**
	 * Adds a route to the failed state, or updates its entry, and sets an alarm to retry it.
	 *
	 * The first retry is scheduled 2 seconds later. The next ones are scheduled
	 * `2 ** (retryCount + 1) * revalidationRetryInterval` later, where `retryCount` is the number of
	 * previous failures. Once the route has failed `maxRetries` times, an error is logged and the route is
	 * removed from `routeInFailedState` instead.
	 *
	 * The entry is persisted to the `failed_state` table unless SQLite is disabled.
	 *
	 * @param msg Message of the failed revalidation.
	 * @returns A promise that resolves when the failed state is updated and the alarm is set.
	 * @throws When the SQL write or setting the alarm fails.
	 */
	async addToFailedState(msg: QueueMessage) {
		debug(`Adding ${msg.MessageBody.host}${msg.MessageBody.url} to the failed state`);
		const existingFailedState = this.routeInFailedState.get(msg.MessageDeduplicationId);

		let updatedFailedState: FailedState;

		if (existingFailedState) {
			if (existingFailedState.retryCount >= this.maxRetries) {
				error(
					`The revalidation for ${msg.MessageBody.host}${msg.MessageBody.url} has failed after ${this.maxRetries} retries. It will not be tried again, but subsequent ISR requests will retry.`
				);
				this.routeInFailedState.delete(msg.MessageDeduplicationId);
				return;
			}
			const nextAlarmMs =
				Date.now() + Math.pow(2, existingFailedState.retryCount + 1) * this.revalidationRetryInterval;
			updatedFailedState = {
				...existingFailedState,
				retryCount: existingFailedState.retryCount + 1,
				nextAlarmMs,
			};
		} else {
			updatedFailedState = {
				msg,
				retryCount: 1,
				nextAlarmMs: Date.now() + 2_000,
			};
		}
		this.routeInFailedState.set(msg.MessageDeduplicationId, updatedFailedState);
		if (!this.disableSQLite) {
			this.sql.exec(
				"INSERT OR REPLACE INTO failed_state (id, data, buildId) VALUES (?, ?, ?)",
				msg.MessageDeduplicationId,
				JSON.stringify(updatedFailedState),
				process.env.__OPEN_NEXT_BUILD_ID
			);
		}
		// We probably want to do something if routeInFailedState is becoming too big, at least log it
		await this.addAlarm();
	}

	/**
	 * Sets an alarm for the earliest failed revalidation.
	 *
	 * Does nothing when an alarm is already set or when no revalidation is in the failed state.
	 * When the earliest retry time is in the past, the alarm is set `revalidationRetryInterval` from now.
	 *
	 * @returns A promise that resolves when the alarm is set.
	 * @throws When reading or setting the alarm fails.
	 */
	async addAlarm() {
		const existingAlarm = await this.ctx.storage.getAlarm({ allowConcurrency: false });
		if (existingAlarm) return;
		if (this.routeInFailedState.size === 0) return;

		let nextAlarmToSetup = Math.min(
			...Array.from(this.routeInFailedState.values()).map(({ nextAlarmMs }) => nextAlarmMs)
		);
		if (nextAlarmToSetup < Date.now()) {
			// We don't want to set an alarm in the past
			nextAlarmToSetup = Date.now() + this.revalidationRetryInterval;
		}
		await this.ctx.storage.setAlarm(nextAlarmToSetup);
	}

	/**
	 * Restores the state persisted in SQLite.
	 *
	 * Creates the `failed_state` and `sync` tables, deletes the rows written by other builds, restores
	 * the failed revalidations and sets the alarm to retry them. Revalidations that were in progress are
	 * not restored, as their outcome is unknown. Does nothing when SQLite is disabled.
	 *
	 * @returns A promise that resolves when the state is restored.
	 * @throws When a SQL statement fails, a row cannot be parsed, or setting the alarm fails.
	 */
	async initState() {
		if (this.disableSQLite) return;
		// We store the failed state as a blob, we don't want to do anything with it anyway besides restoring
		this.sql.exec("CREATE TABLE IF NOT EXISTS failed_state (id TEXT PRIMARY KEY, data TEXT, buildId TEXT)");

		// We create the sync table to handle eventually consistent incremental cache
		this.sql.exec("CREATE TABLE IF NOT EXISTS sync (id TEXT PRIMARY KEY, lastSuccess INTEGER, buildId TEXT)");

		// Before doing anything else, we clear the DB for any potential old data
		// TODO: extract this to a function so that it could be called by the user at another time than init
		this.sql.exec("DELETE FROM failed_state WHERE buildId != ?", process.env.__OPEN_NEXT_BUILD_ID);
		this.sql.exec("DELETE FROM sync WHERE buildId != ?", process.env.__OPEN_NEXT_BUILD_ID);

		const failedStateCursor = this.sql.exec<{ id: string; data: string }>("SELECT * FROM failed_state");
		for (const row of failedStateCursor) {
			this.routeInFailedState.set(row.id, JSON.parse(row.data));
		}

		// Now that we have restored the failed state, we can restore the alarm as well
		await this.addAlarm();
	}

	/**
	 * Checks whether the route was successfully revalidated after the message's `lastModified`.
	 *
	 * This happens when the message comes from a stale copy of an eventually consistent incremental cache
	 * (e.g. KV, or a regional cache) read after the revalidation. Times are compared in seconds.
	 *
	 * @param msg Message of the route to check.
	 * @returns `true` if the route was revalidated after the message's `lastModified`, `false` otherwise,
	 *   when SQLite is disabled, or when the query fails.
	 */
	checkSyncTable(msg: QueueMessage) {
		try {
			if (this.disableSQLite) return false;
			return (
				this.sql
					.exec(
						"SELECT 1 FROM sync WHERE id = ? AND lastSuccess > ? LIMIT 1",
						`${msg.MessageBody.host}${msg.MessageBody.url}`,
						Math.round(msg.MessageBody.lastModified / 1000)
					)
					.toArray().length > 0
			);
		} catch {
			return false;
		}
	}
}
