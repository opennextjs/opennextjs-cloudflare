import { generateMessageGroupId } from "@opennextjs/aws/core/routing/queue.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import cache, { DEFAULT_REVALIDATION_TIMEOUT } from "./memory-queue";

vi.mock("./.next/prerender-manifest.json", () => Promise.resolve({ preview: { previewModeId: "id" } }));

const defaultOpts = {
  MessageBody: { host: "test.local", url: "/test" },
  MessageGroupId: generateMessageGroupId("/test"),
  MessageDeduplicationId: "",
};

describe("MemoryQueue", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    globalThis.internalFetch = vi.fn().mockReturnValue(new Promise((res) => setTimeout(() => res(true), 1)));
  });

  afterEach(() => vi.clearAllMocks());

  it("should process revalidations for a path", async () => {
    const firstRequest = cache.send(defaultOpts);
    vi.advanceTimersByTime(DEFAULT_REVALIDATION_TIMEOUT);
    await firstRequest;
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);

    const secondRequest = cache.send(defaultOpts);
    vi.advanceTimersByTime(1);
    await secondRequest;
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(2);
  });

  it("should process revalidations for multiple paths", async () => {
    const firstRequest = cache.send(defaultOpts);
    vi.advanceTimersByTime(1);
    await firstRequest;
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);

    const secondRequest = cache.send({ ...defaultOpts, MessageGroupId: generateMessageGroupId("/other") });
    vi.advanceTimersByTime(1);
    await secondRequest;
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(2);
  });

  it("should de-dupe revalidations", async () => {
    const requests = [cache.send(defaultOpts), cache.send(defaultOpts)];
    vi.advanceTimersByTime(1);
    await Promise.all(requests);
    expect(globalThis.internalFetch).toHaveBeenCalledTimes(1);
  });
});
