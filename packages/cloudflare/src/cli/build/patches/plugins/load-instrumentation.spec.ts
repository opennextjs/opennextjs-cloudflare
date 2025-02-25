import { describe, expect, test } from "vitest";

import { patchCode } from "../ast/util.js";
import { getRule } from "./load-instrumentation.js";

describe("LoadInstrumentationModule", () => {
  const code = `
      export default class NextNodeServer extends BaseServer {
        protected async loadInstrumentationModule() {
          if (!this.serverOptions.dev) {
            try {
              this.instrumentation = await dynamicRequire(
                resolve(
                  this.serverOptions.dir || '.',
                  this.serverOptions.conf.distDir!,
                  'server',
                  INSTRUMENTATION_HOOK_FILENAME
                )
              )
            } catch (err: any) {
              if (err.code !== 'MODULE_NOT_FOUND') {
                throw new Error(
                  'An error occurred while loading the instrumentation hook',
                  { cause: err }
                )
              }
            }
          }
          return this.instrumentation
        }
      }
    `;

  test("patch when an instrumentation file is not present", async () => {
    expect(patchCode(code, await getRule(null))).toMatchInlineSnapshot(`
        "export default class NextNodeServer extends BaseServer {
                async loadInstrumentationModule() { this.instrumentation = null; return this.instrumentation; }
              }
            "
      `);
  });

  test("patch when an instrumentation file is present", async () => {
    expect(patchCode(code, await getRule("/_file_exists_/instrumentation.js"))).toMatchInlineSnapshot(`
        "export default class NextNodeServer extends BaseServer {
                async loadInstrumentationModule() { this.instrumentation = require('/_file_exists_/instrumentation.js'); return this.instrumentation; }
              }
            "
      `);
  });
});
