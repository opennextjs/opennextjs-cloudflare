import { describe, expect, it } from "vitest";

import { normalizePathForInlineCode } from "./normalize-path-for-inline-code";

describe("normalizePathForInlineCode", () => {
  describe.runIf(process.platform === "win32")("windows", () => {
    it("should produce an absolute path ready to be embedded in inlined code", () => {
      const code = `const d = require('${normalizePathForInlineCode("/Users/me/projects/cloudflare/index.mjs")}').default;`;
      expect(code).toEqual("const d = require('\\Users\\me\\projects\\cloudflare\\index.mjs').default;");
    });

    it("should produce a relative path ready to be embedded in inlined code", () => {
      const code = `const d = require('${normalizePathForInlineCode("../../tmp/index.mjs")}').default;`;
      expect(code).toEqual("const d = require('..\\..\\tmp\\index.mjs').default;");
    });
  });

  describe.runIf(process.platform === "linux" || process.platform === "darwin")("linux/mac", () => {
    it("should produce an absolute path ready to be embedded in inlined code", () => {
      const code = `const d = require('${normalizePathForInlineCode("/Users/me/projects/cloudflare/index.mjs")}').default;`;
      expect(code).toEqual("const d = require('/Users/me/projects/cloudflare/index.mjs').default;");
    });

    it("should produce a relative path ready to be embedded in inlined code", () => {
      const code = `const d = require('${normalizePathForInlineCode("../../tmp/index.mjs")}').default;`;
      expect(code).toEqual("const d = require('../../tmp/index.mjs').default;");
    });
  });
});
