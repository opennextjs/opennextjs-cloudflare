import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizePathForInlineCode } from "./normalize-path-for-inline-code";

const isWindows = process.platform === "win32";

describe("normalizePathForInlineCode", () => {
  it("should produce an absolute path ready to be embedded in inlined code", () => {
    const joined = path.join("/", "Users", "me", "projects", "cloudflare", "index.mjs");
    const code = `const d = require('${normalizePathForInlineCode(joined)}').default;`;
    if (!isWindows) {
      expect(code).toEqual("const d = require('/Users/me/projects/cloudflare/index.mjs').default;");
    } else {
      expect(code).toEqual("const d = require('\\Users\\me\\projects\\cloudflare\\index.mjs').default;");
    }
  });

  it("should produce a relative path ready to be embedded in inlined code", () => {
    const joined = path.join("..", "..", "tmp", "index.mjs");
    const code = `const d = require('${normalizePathForInlineCode(joined)}').default;`;
    if (!isWindows) {
      expect(code).toEqual("const d = require('../../tmp/index.mjs').default;");
    } else {
      expect(code).toEqual("const d = require('..\\..\\tmp\\index.mjs').default;");
    }
  });
});
