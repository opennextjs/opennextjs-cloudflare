import { describe, expect, test } from "vitest";

import { patchCode } from "../ast/util.js";
import { instrumentationRule } from "./load-instrumentation.js";

describe("LoadInstrumentationModule", () => {
  test("patch", () => {
    const code = `
export default class NextNodeServer extends BaseServer<
  Options,
  NodeNextRequest,
  NodeNextResponse
> {
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
}`;

    expect(patchCode(code, instrumentationRule)).toMatchInlineSnapshot(`
      "export default class NextNodeServer extends BaseServer<
        Options,
        NodeNextRequest,
        NodeNextResponse
      > {
        async loadInstrumentationModule() { }
      }"
    `);
  });
});
