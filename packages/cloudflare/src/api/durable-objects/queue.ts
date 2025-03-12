import { error } from "@opennextjs/aws/adapters/logger.js";
import type { QueueMessage } from "@opennextjs/aws/types/overrides";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";
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

  service: NonNullable<CloudflareEnv["NEXT_CACHE_REVALIDATION_WORKER"]>;

  // TODO: allow this to be configurable
  maxRevalidations = MAX_REVALIDATION_BY_DURABLE_OBJECT;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    const service = env.NEXT_CACHE_REVALIDATION_WORKER;
    // If there is no service binding, we throw an error because we can't revalidate without it
    if (!service) throw new IgnorableError("No service binding for cache revalidation worker");
    this.service = service;

  }
  
  async revalidate(msg: ExtendedQueueMessage) {
    // If there is already an ongoing revalidation, we don't need to revalidate again
    if (this.ongoingRevalidations.has(msg.MessageDeduplicationId)) return;

    if(this.ongoingRevalidations.size >= MAX_REVALIDATION_BY_DURABLE_OBJECT) {
      const ongoingRevalidations = this.ongoingRevalidations.values()
      await this.ctx.blockConcurrencyWhile(() => Promise.race(ongoingRevalidations));
    }

    const revalidationPromise = this.executeRevalidation(msg);

    // We store the promise to dedupe the revalidation
    this.ongoingRevalidations.set(
      msg.MessageDeduplicationId,
      revalidationPromise
    );

    this.ctx.waitUntil(revalidationPromise);
  }

  private async executeRevalidation({MessageBody: {host, url}, MessageDeduplicationId, previewModeId}: ExtendedQueueMessage) {
    try {
      const protocol = host.includes("localhost") ? "http" : "https";

      //TODO: handle the different types of errors that can occur during the fetch (i.e. timeout, network error, etc)
      await this.service.fetch(`${protocol}://${host}${url}`, {
        method: "HEAD",
        headers: {
          "x-prerender-revalidate": previewModeId,
          "x-isr": "1",
        },
        signal: AbortSignal.timeout(DEFAULT_REVALIDATION_TIMEOUT_MS)
      })
    } catch (e) {
      error(e);
    } finally {
      this.ongoingRevalidations.delete(MessageDeduplicationId);
    }
  }
  
}