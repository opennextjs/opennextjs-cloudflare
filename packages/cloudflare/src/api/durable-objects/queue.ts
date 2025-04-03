import { debug, error } from "@opennextjs/aws/adapters/logger.js";
import type { QueueMessage } from "@opennextjs/aws/types/overrides";
import {
  FatalError,
  IgnorableError,
  isOpenNextError,
  RecoverableError,
} from "@opennextjs/aws/utils/error.js";
import { DurableObject } from "cloudflare:workers";

const DEFAULT_MAX_REVALIDATION = 5;
const DEFAULT_REVALIDATION_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_INTERVAL_MS = 2_000;
const DEFAULT_MAX_RETRIES = 6;

interface FailedState {
  msg: QueueMessage;
  retryCount: number;
  nextAlarmMs: number;
}

export class DOQueueHandler extends DurableObject<CloudflareEnv> {
  // Ongoing revalidations are deduped by the deduplication id
  // Since this is running in waitUntil, we expect the durable object state to persist this during the duration of the revalidation
  // TODO: handle incremental cache with only eventual consistency (i.e. KV or R2/D1 with the optional cache layer on top)
  ongoingRevalidations = new Map<string, Promise<void>>();

  sql: SqlStorage;

  routeInFailedState = new Map<string, FailedState>();

  service: NonNullable<CloudflareEnv["WORKER_SELF_REFERENCE"]>;

  // Configurable params
  readonly maxRevalidations: number;
  readonly revalidationTimeout: number;
  readonly revalidationRetryInterval: number;
  readonly maxRetries: number;
  readonly disableSQLite: boolean;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.service = env.WORKER_SELF_REFERENCE!;
    // If there is no service binding, we throw an error because we can't revalidate without it
    if (!this.service) throw new IgnorableError("No service binding for cache revalidation worker");
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

  async revalidate(msg: QueueMessage) {
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
      const ongoingRevalidations = this.ongoingRevalidations.values();
      // When there is more than the max revalidations, we block concurrency until one of the revalidations finishes
      // We still await the promise to ensure the revalidation is completed
      // This is fine because the queue itself run inside a waitUntil
      await this.ctx.blockConcurrencyWhile(async () => {
        debug(`Waiting for one of the revalidations to finish`);
        await Promise.race(ongoingRevalidations);
      });
    }

    const revalidationPromise = this.executeRevalidation(msg);

    // We store the promise to dedupe the revalidation
    this.ongoingRevalidations.set(msg.MessageDeduplicationId, revalidationPromise);

    // TODO: check if the object stays up during waitUntil so that the internal state is maintained
    this.ctx.waitUntil(revalidationPromise);
  }

  async executeRevalidation(msg: QueueMessage) {
    try {
      debug(`Revalidating ${msg.MessageBody.host}${msg.MessageBody.url}`);
      const {
        MessageBody: { host, url },
      } = msg;
      const protocol = host.includes("localhost") ? "http" : "https";

      const response = await this.service.fetch(`${protocol}://${host}${url}`, {
        method: "HEAD",
        headers: {
          // This is defined during build
          "x-prerender-revalidate": process.env.__NEXT_PREVIEW_MODE_ID!,
          "x-isr": "1",
        },
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
          process.env.__NEXT_BUILD_ID
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
    }
  }

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
        process.env.__NEXT_BUILD_ID
      );
    }
    // We probably want to do something if routeInFailedState is becoming too big, at least log it
    await this.addAlarm();
  }

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

  // This function is used to restore the state of the durable object
  // We don't restore the ongoing revalidations because we cannot know in which state they are
  // We only restore the failed state and the alarm
  async initState() {
    if (this.disableSQLite) return;
    // We store the failed state as a blob, we don't want to do anything with it anyway besides restoring
    this.sql.exec("CREATE TABLE IF NOT EXISTS failed_state (id TEXT PRIMARY KEY, data TEXT, buildId TEXT)");

    // We create the sync table to handle eventually consistent incremental cache
    this.sql.exec("CREATE TABLE IF NOT EXISTS sync (id TEXT PRIMARY KEY, lastSuccess INTEGER, buildId TEXT)");

    // Before doing anything else, we clear the DB for any potential old data
    this.sql.exec("DELETE FROM failed_state WHERE buildId != ?", process.env.__NEXT_BUILD_ID);
    this.sql.exec("DELETE FROM sync WHERE buildId != ?", process.env.__NEXT_BUILD_ID);

    const failedStateCursor = this.sql.exec<{ id: string; data: string }>("SELECT * FROM failed_state");
    for (const row of failedStateCursor) {
      this.routeInFailedState.set(row.id, JSON.parse(row.data));
    }

    // Now that we have restored the failed state, we can restore the alarm as well
    await this.addAlarm();
  }

  /**
   *
   * @param msg
   * @returns `true` if the route has been revalidated since the lastModified from the message, `false` otherwise
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
