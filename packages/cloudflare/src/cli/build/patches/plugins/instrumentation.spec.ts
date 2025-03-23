import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import { getNext14Rule, getNext15Rule } from "./instrumentation.js";

describe("LoadInstrumentationModule (Next15)", () => {
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
    expect(patchCode(code, getNext15Rule(null))).toMatchInlineSnapshot(`
        "export default class NextNodeServer extends BaseServer {
                async loadInstrumentationModule() { this.instrumentation = null; return this.instrumentation; }
              }
            "
      `);
  });

  test("patch when an instrumentation file is present", async () => {
    expect(patchCode(code, getNext15Rule("/_file_exists_/instrumentation.js"))).toMatchInlineSnapshot(`
        "export default class NextNodeServer extends BaseServer {
                async loadInstrumentationModule() { this.instrumentation = require('/_file_exists_/instrumentation.js'); return this.instrumentation; }
              }
            "
      `);
  });
});

describe("prepareImpl (Next14)", () => {
  const code = `
      export default class NextNodeServer extends BaseServer {
          async prepareImpl() {
            await super.prepareImpl();
            if (!this.serverOptions.dev && this.nextConfig.experimental.instrumentationHook) {
              try {
                const instrumentationHook = await dynamicRequire((0, _path.resolve)(this.serverOptions.dir || ".", this.serverOptions.conf.distDir, "server", _constants1.INSTRUMENTATION_HOOK_FILENAME));
                await (instrumentationHook.register == null ? void 0 : instrumentationHook.register.call(instrumentationHook));
              } catch (err2) {
                if (err2.code !== "MODULE_NOT_FOUND") {
                  err2.message = \`An error occurred while loading instrumentation hook: \${err2.message}\`;
                  throw err2;
                }
              }
            }
          }
      }
    `;

  test("patch when an instrumentation file is not present", async () => {
    expect(patchCode(code, getNext14Rule(null))).toMatchInlineSnapshot(`
      "export default class NextNodeServer extends BaseServer {
                async prepareImpl() {
        await super.prepareImpl();
        const instrumentationHook = {};
        await (instrumentationHook.register == null ? void 0 : instrumentationHook.register.call(instrumentationHook));
      }
            }
          "
    `);
  });

  test("patch when an instrumentation file is present", async () => {
    expect(patchCode(code, getNext14Rule("/_file_exists_/instrumentation.js"))).toMatchInlineSnapshot(`
      "export default class NextNodeServer extends BaseServer {
                async prepareImpl() {
        await super.prepareImpl();
        const instrumentationHook = require('/_file_exists_/instrumentation.js');
        await (instrumentationHook.register == null ? void 0 : instrumentationHook.register.call(instrumentationHook));
      }
            }
          "
    `);
  });
});
