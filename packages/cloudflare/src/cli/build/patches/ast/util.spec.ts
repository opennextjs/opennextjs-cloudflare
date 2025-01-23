import { afterEach, describe, expect, it, vi } from "vitest";

import { patchCode } from "./util.js";

describe("patchCode", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should throw an error if rule has a transform", () => {
    expect(() =>
      patchCode(`console.log("hi")`, { rule: { pattern: "console.log($MSG)" }, transform: "not supported" })
    ).toThrow(/not supported/);
  });

  it("should throw an error if rule has no fix", () => {
    expect(() => patchCode(`console.log("hi")`, { rule: { pattern: "console.log($MSG)" } })).toThrow(
      /no fix/
    );
  });

  it("should accept yaml rules", () => {
    const yamlRule = `
rule:
  pattern: a
fix: b
`;

    expect(patchCode(`a`, yamlRule)).toEqual("b");
  });

  it("should apply fix to a single match when once is true", () => {
    expect(patchCode(`a+a`, { rule: { pattern: "a" }, fix: "b" }, { once: true })).toEqual("b+a");
  });

  it("should apply fix to all matches when once is false (default)", () => {
    expect(patchCode(`a+a`, { rule: { pattern: "a" }, fix: "b" })).toEqual("b+b");
    expect(patchCode(`a+a`, { rule: { pattern: "a" }, fix: "b" }, { once: false })).toEqual("b+b");
  });

  it("should handle no matches", () => {
    expect(patchCode(`a`, { rule: { pattern: "b" }, fix: "c" })).toEqual("a");
  });

  it("should replace $PLACEHOLDER with match text", () => {
    expect(
      patchCode(`console.log(message)`, { rule: { pattern: "console.log($MSG)" }, fix: "$MSG" })
    ).toEqual("message");
  });

  it("should handle $PLACEHODLERS that are not found in matches", () => {
    expect(
      patchCode(`console.log(message)`, { rule: { pattern: "console.log($MSG)" }, fix: "$WHAT$$$WHAT" })
    ).toEqual("$WHAT");
  });

  it("should replace $$$PLACEHOLDER with match text", () => {
    expect(
      patchCode(`console.log("hello" + world, "!")`, {
        rule: { pattern: "console.log($$$ARGS)" },
        fix: "$$$ARGS",
      })
    ).toEqual(`"hello" + world,"!"`);
  });
});
