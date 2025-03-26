import { generateMessageGroupId } from "@opennextjs/aws/core/routing/queue.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import cache, { DEFAULT_REVALIDATION_TIMEOUT_MS } from "./memory-queue.js";

vi.mock("./.next/prerender-manifest.json", () => Promise.resolve({ preview: { previewModeId: "id" } }));

const mockServiceWorkerFetch = vi.fn();
vi.mock("../../cloudflare-context", () => ({
  getCloudflareContext: () => ({
    env: { WORKER_SELF_REFERENCE: { fetch: mockServiceWorkerFetch } },
  }),
}));

const generateMessageBody = ({ host, url }: { host: string; url: string }) => ({
  host,
  url,
  eTag: "etag",
  lastModified: Date.now(),
});

describe("MemoryQueue", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    globalThis.internalFetch = vi.fn().mockReturnValue(new Promise((res) => setTimeout(() => res(true), 1)));
  });

  afterEach(() => vi.clearAllMocks());

  it("should process revalidations for a path", async () => {
    const firstRequest = cache.send({
      MessageBody: generateMessageBody({ host: "test.local", url: "/test" }),
      MessageGroupId: generateMessageGroupId("/test"),
      MessageDeduplicationId: "/test",
    });
    vi.advanceTimersByTime(DEFAULT_REVALIDATION_TIMEOUT_MS);
    await firstRequest;
    expect(mockServiceWorkerFetch).toHaveBeenCalledTimes(1);

    const secondRequest = cache.send({
      MessageBody: generateMessageBody({ host: "test.local", url: "/test" }),
      MessageGroupId: generateMessageGroupId("/test"),
      MessageDeduplicationId: "/test",
    });
    vi.advanceTimersByTime(1);
    await secondRequest;
    expect(mockServiceWorkerFetch).toHaveBeenCalledTimes(2);
  });

  it("should process revalidations for multiple paths", async () => {
    const firstRequest = cache.send({
      MessageBody: generateMessageBody({ host: "test.local", url: "/test" }),
      MessageGroupId: generateMessageGroupId("/test"),
      MessageDeduplicationId: "/test",
    });
    vi.advanceTimersByTime(1);
    await firstRequest;
    expect(mockServiceWorkerFetch).toHaveBeenCalledTimes(1);

    const secondRequest = cache.send({
      MessageBody: generateMessageBody({ host: "test.local", url: "/test" }),
      MessageGroupId: generateMessageGroupId("/other"),
      MessageDeduplicationId: "/other",
    });
    vi.advanceTimersByTime(1);
    await secondRequest;
    expect(mockServiceWorkerFetch).toHaveBeenCalledTimes(2);
  });

  it("should de-dupe revalidations", async () => {
    const requests = [
      cache.send({
        MessageBody: generateMessageBody({ host: "test.local", url: "/test" }),
        MessageGroupId: generateMessageGroupId("/test"),
        MessageDeduplicationId: "/test",
      }),
      cache.send({
        MessageBody: generateMessageBody({ host: "test.local", url: "/test" }),
        MessageGroupId: generateMessageGroupId("/test"),
        MessageDeduplicationId: "/test",
      }),
    ];
    vi.advanceTimersByTime(1);
    await Promise.all(requests);
    expect(mockServiceWorkerFetch).toHaveBeenCalledTimes(1);
  });
});
