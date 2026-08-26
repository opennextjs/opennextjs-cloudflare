import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import mockFs from "mock-fs";
import { afterEach, describe, expect, test } from "vitest";

import { normalizePath } from "../../../utils/normalize-path.js";
import { getNext14Rule, getNext15Rule, getNext154Rule, patchInstrumentation } from "./instrumentation.js";

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

describe("getInstrumenationModule (Next15.4)", () => {
	const code = `
    async function getInstrumentationModule(projectDir, distDir) {
      if (cachedInstrumentationModule) {
        return cachedInstrumentationModule;
      }
      try {
        cachedInstrumentationModule = (0, _interopdefault.interopDefault)(await require(_nodepath.default.join(projectDir, distDir, "server", \`\${_constants.INSTRUMENTATION_HOOK_FILENAME}.js\`)));
        return cachedInstrumentationModule;
      } catch (err) {
        if ((0, _iserror.default)(err) && err.code !== "ENOENT" && err.code !== "MODULE_NOT_FOUND" && err.code !== "ERR_MODULE_NOT_FOUND") {
          throw err;
        }
      }
    }
  `;

	test("patch when an instrumentation file is not present", async () => {
		expect(patchCode(code, getNext154Rule(null))).toMatchInlineSnapshot(`
			"async function getInstrumentationModule(projectDir, distDir) {
			      if (cachedInstrumentationModule) {
			        return cachedInstrumentationModule;
			      }
			      try {
			        cachedInstrumentationModule = null;
			        return cachedInstrumentationModule;
			      } catch (err) {
			        if ((0, _iserror.default)(err) && err.code !== "ENOENT" && err.code !== "MODULE_NOT_FOUND" && err.code !== "ERR_MODULE_NOT_FOUND") {
			          throw err;
			        }
			      }
			    }
			  "
		`);
	});

	test("patch when an instrumentation file is present", async () => {
		expect(patchCode(code, getNext154Rule("/_file_exists_/instrumentation.js"))).toMatchInlineSnapshot(`
			"async function getInstrumentationModule(projectDir, distDir) {
			      if (cachedInstrumentationModule) {
			        return cachedInstrumentationModule;
			      }
			      try {
			        cachedInstrumentationModule = require('/_file_exists_/instrumentation.js');
			        return cachedInstrumentationModule;
			      } catch (err) {
			        if ((0, _iserror.default)(err) && err.code !== "ENOENT" && err.code !== "MODULE_NOT_FOUND" && err.code !== "ERR_MODULE_NOT_FOUND") {
			          throw err;
			        }
			      }
			    }
			  "
		`);
	});
});

describe("patchInstrumentation", () => {
	const monorepoRoot = "/app";
	const appBuildOutputPath = "/app";
	const outputDir = "/app/.open-next";

	// The path Next.js loads the instrumentation hook from since 15.4.
	// The middleware bundle loads it too since 16.3, see https://github.com/opennextjs/opennextjs-cloudflare/issues/1362
	const instrumentationGlobalsPath =
		"/app/node_modules/next/dist/server/lib/router-utils/instrumentation-globals.external.js";
	const builtInstrumentationPath = join(
		outputDir,
		"server-functions/default/.next/server/instrumentation.js"
	);

	const buildOpts = {
		appBuildOutputPath,
		monorepoRoot,
		outputDir,
		nextVersion: "16.3.3",
	} as BuildOptions;

	const instrumentationGlobals = `
    let cachedInstrumentationModule;
    async function getInstrumentationModule(projectDir, distDir) {
      if (cachedInstrumentationModule) {
        return cachedInstrumentationModule;
      }
      try {
        cachedInstrumentationModule = (0, _interopdefault.interopDefault)(await require(_nodepath.default.join(projectDir, distDir, "server", \`\${_constants.INSTRUMENTATION_HOOK_FILENAME}.js\`)));
        return cachedInstrumentationModule;
      } catch (err) {
        if ((0, _iserror.default)(err) && err.code !== "ENOENT") {
          throw err;
        }
      }
    }
  `;

	/**
	 * Applies the content updates registered by `patchInstrumentation` to a file, as esbuild would.
	 *
	 * @param path The path of the file to load.
	 * @param options The options passed to `patchInstrumentation`.
	 * @returns The patched content of the file.
	 */
	async function loadPatched(
		path: string,
		options?: Parameters<typeof patchInstrumentation>[2]
	): Promise<string> {
		const updater = new ContentUpdater(buildOpts);
		patchInstrumentation(updater, buildOpts, options);

		type OnLoad = (args: { path: string; namespace: string }) => Promise<{ contents: string } | undefined>;
		let onLoad: OnLoad | undefined;
		await updater.plugin.setup({
			onLoad: (_filter: unknown, callback: OnLoad) => {
				onLoad = callback;
			},
		} as never);

		const result = await onLoad?.({ path, namespace: "file" });
		return result?.contents ?? readFileSync(path, "utf-8");
	}

	afterEach(() => mockFs.restore());

	test("requires the built instrumentation when the app has an instrumentation hook", async () => {
		mockFs({
			[instrumentationGlobalsPath]: instrumentationGlobals,
			[builtInstrumentationPath]: "exports.register = () => {};",
		});

		expect(await loadPatched(instrumentationGlobalsPath)).toContain(
			`cachedInstrumentationModule = require('${normalizePath(builtInstrumentationPath)}');`
		);
	});

	test("nulls the instrumentation out when the app has no instrumentation hook", async () => {
		mockFs({ [instrumentationGlobalsPath]: instrumentationGlobals });

		expect(await loadPatched(instrumentationGlobalsPath)).toContain("cachedInstrumentationModule = null;");
	});

	test("nulls the instrumentation out when `loadInstrumentation` is false", async () => {
		mockFs({
			[instrumentationGlobalsPath]: instrumentationGlobals,
			[builtInstrumentationPath]: "exports.register = () => {};",
		});

		expect(await loadPatched(instrumentationGlobalsPath, { loadInstrumentation: false })).toContain(
			"cachedInstrumentationModule = null;"
		);
	});
});
