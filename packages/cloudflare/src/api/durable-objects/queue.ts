import { error } from "@opennextjs/aws/adapters/logger.js";
import type { QueueMessage } from "@opennextjs/aws/types/overrides";
import {
  FatalError,
  IgnorableError,
  isOpenNextError,
  RecoverableError,
} from "@opennextjs/aws/utils/error.js";
import { DurableObject } from "cloudflare:workers";

const MAX_REVALIDATION_BY_DURABLE_OBJECT = 5;
const DEFAULT_REVALIDATION_TIMEOUT_MS = 10_000;

interface ExtendedQueueMessage extends QueueMessage {
  previewModeId: string;
}

export class DurableObjectQueueHandler extends DurableObject<CloudflareEnv> {
  // Ongoing revalidations are deduped by the deduplication id
  // Since this is running in waitUntil, we expect the durable object state to persist this during the duration of the revalidation
  // TODO: handle incremental cache with only eventual consistency (i.e. KV or R2/D1 with the optional cache layer on top)
  ongoingRevalidations = new Map<string, Promise<void>>();

  // TODO: restore the state of the failed revalidations - Probably in the next PR where i'll add the storage
  routeInFailedState = new Map<
    string,
    { msg: ExtendedQueueMessage; retryCount: number; nextAlarmMs: number }
  >();

  service: NonNullable<CloudflareEnv["NEXT_CACHE_REVALIDATION_WORKER"]>;

  // TODO: allow this to be configurable - How do we want todo that? env variable? passed down from the queue override ?
  maxRevalidations = MAX_REVALIDATION_BY_DURABLE_OBJECT;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.service = env.NEXT_CACHE_REVALIDATION_WORKER!;
    // If there is no service binding, we throw an error because we can't revalidate without it
    if (!this.service) throw new IgnorableError("No service binding for cache revalidation worker");
  }

  async revalidate(msg: ExtendedQueueMessage) {
    // If there is already an ongoing revalidation, we don't need to revalidate again
    if (this.ongoingRevalidations.has(msg.MessageDeduplicationId)) return;

    // The route is already in a failed state, it will be retried later
    if (this.routeInFailedState.has(msg.MessageDeduplicationId)) return;

    if (this.ongoingRevalidations.size >= MAX_REVALIDATION_BY_DURABLE_OBJECT) {
      const ongoingRevalidations = this.ongoingRevalidations.values();
      // When there is more than the max revalidations, we block concurrency until one of the revalidations finishes
      // We still await the promise to ensure the revalidation is completed
      // This is fine because the queue itself run inside a waitUntil
      await this.ctx.blockConcurrencyWhile(() => Promise.race(ongoingRevalidations));
    }

    const revalidationPromise = this.executeRevalidation(msg);

    // We store the promise to dedupe the revalidation
    this.ongoingRevalidations.set(msg.MessageDeduplicationId, revalidationPromise);

    // TODO: check if the object stays up during waitUntil so that the internal state is maintained
    this.ctx.waitUntil(revalidationPromise);
  }

  private async executeRevalidation(msg: ExtendedQueueMessage) {
    try {
      const {
        MessageBody: { host, url },
        previewModeId,
      } = msg;
      const protocol = host.includes("localhost") ? "http" : "https";

      //TODO: handle the different types of errors that can occur during the fetch (i.e. timeout, network error, etc)
      const response = await this.service.fetch(`${protocol}://${host}${url}`, {
        method: "HEAD",
        headers: {
          "x-prerender-revalidate": previewModeId,
          "x-isr": "1",
        },
        signal: AbortSignal.timeout(DEFAULT_REVALIDATION_TIMEOUT_MS),
      });
      // Now we need to handle errors from the fetch
      if (response.status === 200 && response.headers.get("x-nextjs-cache") !== "REVALIDATED") {
        // Something is very wrong here, it means that either the page is not ISR/SSG (and we shouldn't be here) or the `x-prerender-revalidate` header is not correct (and it should not happen either)
        throw new FatalError(
          `The revalidation for ${host}${url} cannot be done. This error should never happen.`
        );
      } else if (response.status === 404) {
        // The page is not found, we should not revalidate it
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
        throw new RecoverableError(`An unknown error occurred while revalidating ${host}${url}`);
      }
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
      await this.executeRevalidation(event.msg);
      this.routeInFailedState.delete(event.msg.MessageDeduplicationId);
    }
  }

  async addToFailedState(msg: ExtendedQueueMessage) {
    const existingFailedState = this.routeInFailedState.get(msg.MessageDeduplicationId);

    if (existingFailedState) {
      if (existingFailedState.retryCount >= 6) {
        // We give up after 6 retries and log the error
        error(
          `The revalidation for ${msg.MessageBody.host}${msg.MessageBody.url} has failed after 6 retries. It will not be tried again, but subsequent ISR requests will retry.`
        );
        this.routeInFailedState.delete(msg.MessageDeduplicationId);
        return;
      }
      const nextAlarmMs = Date.now() + Math.pow(2, existingFailedState.retryCount + 1) * 2_000;
      this.routeInFailedState.set(msg.MessageDeduplicationId, {
        ...existingFailedState,
        retryCount: existingFailedState.retryCount + 1,
        nextAlarmMs,
      });
    } else {
      this.routeInFailedState.set(msg.MessageDeduplicationId, {
        msg,
        retryCount: 1,
        nextAlarmMs: Date.now() + 2_000,
      });
    }
    // We probably want to do something if routeInFailedState is becoming too big, at least log it
    await this.addAlarm();
  }

  async addAlarm() {
    const existingAlarm = await this.ctx.storage.getAlarm({ allowConcurrency: false });
    if (existingAlarm) return;
    if (this.routeInFailedState.size === 0) return;

    const nextAlarmToSetup = Math.min(
      ...Array.from(this.routeInFailedState.values()).map(({ nextAlarmMs }) => nextAlarmMs)
    );
    await this.ctx.storage.setAlarm(nextAlarmToSetup);
  }
}
