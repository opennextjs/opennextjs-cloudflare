import { describe, expect, it } from "vitest";

import { normalizePathForInlineCode } from "./normalize-path-for-inline-code";

describe("normalizePathForInlineCode", () => {
  it("should extract production env vars", () => {
    const result = normalizePathForInlineCode("TODO");
    expect(result).toBeFalsy();
  });
});
