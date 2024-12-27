import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizePath } from "./normalize-path";

describe("normalizePath", () => {
  it("should produce an absolute path ready to be embedded in inlined code", () => {
    const joined = path.join("/", "Users", "me", "projects", "cloudflare", "index.mjs");
    const result = normalizePath(joined);
    // Note: the result is the same both on linux/mac and windows
    expect(result).toEqual("/Users/me/projects/cloudflare/index.mjs");
  });

  it("should produce a relative path ready to be embedded in inlined code", () => {
    const joined = path.join("..", "..", "tmp", "index.mjs");
    const result = normalizePath(joined);

    // Note: the result is the same both on linux/mac and windows
    expect(result).toEqual("../../tmp/index.mjs");
  });
});
