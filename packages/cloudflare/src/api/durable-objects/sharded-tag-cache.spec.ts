import { describe, expect, it, vi } from "vitest";

import { DOShardedTagCache } from "./sharded-tag-cache";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: DurableObjectState;
    env: CloudflareEnv;
    constructor(ctx: DurableObjectState, env: CloudflareEnv) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const createDOShardedTagCache = () => {
  const mockState = {
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn()),
    storage: {
      setAlarm: vi.fn(),
      getAlarm: vi.fn(),
      sql: {
        exec: vi.fn().mockImplementation(() => ({
          one: vi.fn(),
        })),
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new DOShardedTagCache(mockState as any, {});
};

describe("DOShardedTagCache class", () => {
  it("should block concurrency while creating the table", async () => {
    const cache = createDOShardedTagCache();
    // @ts-expect-error - testing private method
    expect(cache.ctx.blockConcurrencyWhile).toHaveBeenCalled();
    expect(cache.sql.exec).toHaveBeenCalledWith(
      `CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER)`
    );
  });
});
