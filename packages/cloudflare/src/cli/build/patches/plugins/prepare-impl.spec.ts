import { describe, expect, test, vi } from "vitest";

import { patchCode } from "../ast/util.js";
import { getRule } from "./prepare-impl.js";

vi.mock(import("node:fs"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    existsSync(path) {
      return `${path}`.includes("_file_exists_");
    },
  };
});

describe("prepareImpl", () => {
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
    expect(patchCode(code, await getRule(null))).toMatchInlineSnapshot(`
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
    expect(patchCode(code, await getRule("/_file_exists_/instrumentation.js"))).toMatchInlineSnapshot(`
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
