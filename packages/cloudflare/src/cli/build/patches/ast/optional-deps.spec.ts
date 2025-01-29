import { describe, expect, it } from "vitest";

import { buildOptionalDepRule } from "./optional-deps.js";
import { patchCode } from "./util.js";

describe("optional dependecy", () => {
  it('should wrap a top-level require("caniuse-lite") in a try-catch', () => {
    const code = `t = require("caniuse-lite");`;
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "try {
        t = require("caniuse-lite");
      } catch {
        throw new Error('The optional dependency "caniuse-lite" is not installed');
      };"
    `);
  });

  it('should wrap a top-level require("caniuse-lite/data") in a try-catch', () => {
    const code = `t = require("caniuse-lite/data");`;
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(
      `
      "try {
        t = require("caniuse-lite/data");
      } catch {
        throw new Error('The optional dependency "caniuse-lite/data" is not installed');
      };"
    `
    );
  });

  it('should wrap e.exports = require("caniuse-lite") in a try-catch', () => {
    const code = 'e.exports = require("caniuse-lite");';
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "try {
        e.exports = require("caniuse-lite");
      } catch {
        throw new Error('The optional dependency "caniuse-lite" is not installed');
      };"
    `);
  });

  it('should wrap module.exports = require("caniuse-lite") in a try-catch', () => {
    const code = 'module.exports = require("caniuse-lite");';
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "try {
        module.exports = require("caniuse-lite");
      } catch {
        throw new Error('The optional dependency "caniuse-lite" is not installed');
      };"
    `);
  });

  it('should wrap exports.foo = require("caniuse-lite") in a try-catch', () => {
    const code = 'exports.foo = require("caniuse-lite");';
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "try {
        exports.foo = require("caniuse-lite");
      } catch {
        throw new Error('The optional dependency "caniuse-lite" is not installed');
      };"
    `);
  });

  it('should not wrap require("lodash") in a try-catch', () => {
    const code = 't = require("lodash");';
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(
      `"t = require("lodash");"`
    );
  });

  it('should not wrap require("other-module") if it does not match caniuse-lite regex', () => {
    const code = 't = require("other-module");';
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(
      `"t = require("other-module");"`
    );
  });

  it("should not wrap a require() call already inside a try-catch", () => {
    const code = `
try {
  t = require("caniuse-lite");
} catch {}
`;
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "try {
        t = require("caniuse-lite");
      } catch {}
      "
    `);
  });

  it("should handle require with subpath and not wrap if already in try-catch", () => {
    const code = `
try {
   t = require("caniuse-lite/path");
} catch {}
`;
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "try {
         t = require("caniuse-lite/path");
      } catch {}
      "
    `);
  });

  it("should handle multiple dependencies", () => {
    const code = `
t1 = require("caniuse-lite");
t2 = require("caniuse-lite/path");
t3 = require("jimp");
t4 = require("jimp/path");
`;
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite", "jimp"]))).toMatchInlineSnapshot(`
      "try {
        t1 = require("caniuse-lite");
      } catch {
        throw new Error('The optional dependency "caniuse-lite" is not installed');
      };
      try {
        t2 = require("caniuse-lite/path");
      } catch {
        throw new Error('The optional dependency "caniuse-lite/path" is not installed');
      };
      try {
        t3 = require("jimp");
      } catch {
        throw new Error('The optional dependency "jimp" is not installed');
      };
      try {
        t4 = require("jimp/path");
      } catch {
        throw new Error('The optional dependency "jimp/path" is not installed');
      };
      "
    `);
  });

  it("should not update partial matches", () => {
    const code = `
t1 = require("before-caniuse-lite");
t2 = require("before-caniuse-lite/path");
t3 = require("caniuse-lite-after");
t4 = require("caniuse-lite-after/path");
`;
    expect(patchCode(code, buildOptionalDepRule(["caniuse-lite"]))).toMatchInlineSnapshot(`
      "t1 = require("before-caniuse-lite");
      t2 = require("before-caniuse-lite/path");
      t3 = require("caniuse-lite-after");
      t4 = require("caniuse-lite-after/path");
      "
    `);
  });
});
