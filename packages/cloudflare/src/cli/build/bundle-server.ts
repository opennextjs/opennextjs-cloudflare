import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build, Plugin } from "esbuild";

import { Config } from "../config.js";
import * as patches from "./patches/index.js";
import { normalizePath } from "./utils/index.js";

/** The dist directory of the Cloudflare adapter package */
const packageDistDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Bundle the Open Next server.
 */
export async function bundleServer(config: Config, openNextOptions: BuildOptions): Promise<void> {
  patches.copyPackageCliFiles(packageDistDir, config, openNextOptions);

  const nextConfigStr =
    fs
      .readFileSync(path.join(config.paths.output.standaloneApp, "server.js"), "utf8")
      ?.match(/const nextConfig = ({.+?})\n/)?.[1] ?? {};

  console.log(`\x1b[35m⚙️ Bundling the OpenNext server...\n\x1b[0m`);

  patches.patchWranglerDeps(config);
  patches.updateWebpackChunksFile(config);

  const { appBuildOutputPath, appPath, outputDir, monorepoRoot } = openNextOptions;
  const outputPath = path.join(outputDir, "server-functions", "default");
  const packagePath = path.relative(monorepoRoot, appBuildOutputPath);
  const openNextServer = path.join(outputPath, packagePath, `index.mjs`);
  const openNextServerBundle = path.join(outputPath, packagePath, `handler.mjs`);

  await build({
    entryPoints: [openNextServer],
    bundle: true,
    outfile: openNextServerBundle,
    format: "esm",
    target: "esnext",
    minify: false,
    plugins: [createFixRequiresESBuildPlugin(config)],
    external: ["./middleware/handler.mjs"],
    alias: {
      // Note: we apply an empty shim to next/dist/compiled/ws because it generates two `eval`s:
      //   eval("require")("bufferutil");
      //   eval("require")("utf-8-validate");
      "next/dist/compiled/ws": path.join(config.paths.internal.templates, "shims", "empty.js"),
      // Note: we apply an empty shim to next/dist/compiled/edge-runtime since (amongst others) it generated the following `eval`:
      //   eval(getModuleCode)(module, module.exports, throwingRequire, params.context, ...Object.values(params.scopedContext));
      //   which comes from https://github.com/vercel/edge-runtime/blob/6e96b55f/packages/primitives/src/primitives/load.js#L57-L63
      // QUESTION: Why did I encountered this but mhart didn't?
      "next/dist/compiled/edge-runtime": path.join(config.paths.internal.templates, "shims", "empty.js"),
      // `@next/env` is a library Next.js uses for loading dotenv files, for obvious reasons we need to stub it here
      // source: https://github.com/vercel/next.js/tree/0ac10d79720/packages/next-env
      "@next/env": path.join(config.paths.internal.templates, "shims", "env.js"),
    },
    define: {
      // config file used by Next.js, see: https://github.com/vercel/next.js/blob/68a7128/packages/next/src/build/utils.ts#L2137-L2139
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG": JSON.stringify(nextConfigStr),
      // Next.js tried to access __dirname so we need to define it
      __dirname: '""',
      // Note: we need the __non_webpack_require__ variable declared as it is used by next-server:
      // https://github.com/vercel/next.js/blob/be0c3283/packages/next/src/server/next-server.ts#L116-L119
      __non_webpack_require__: "require",
      // Ask mhart if he can explain why the `define`s below are necessary
      "process.env.NEXT_RUNTIME": '"nodejs"',
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_MINIMAL": "true",
    },
    // We need to set platform to node so that esbuild doesn't complain about the node imports
    platform: "node",
    banner: {
      js: `
// __dirname is used by unbundled js files (which don't inherit the __dirname present in the define field)
// so we also need to set it on the global scope
// Note: this was hit in the next/dist/compiled/@opentelemetry/api module
globalThis.__dirname ??= "";

// Do not crash on cache not supported
// https://github.com/cloudflare/workerd/pull/2434
// compatibility flag "cache_option_enabled" -> does not support "force-cache"
const curFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (init) {
    delete init.cache;
  }
  return curFetch(input, init);
};
import __cf_stream from 'node:stream';
fetch = globalThis.fetch;
const CustomRequest = class extends globalThis.Request {
  constructor(input, init) {
    if (init) {
      delete init.cache;
      // https://github.com/cloudflare/workerd/issues/2746
      // https://github.com/cloudflare/workerd/issues/3245
      Object.defineProperty(init, "body", {
        value: init.body instanceof __cf_stream.Readable ? ReadableStream.from(init.body) : init.body;
      });
    }
    super(input, init);
  }
};
globalThis.Request = CustomRequest;
Request = globalThis.Request;
// Makes the edge converter returns either a Response or a Request.
globalThis.__dangerous_ON_edge_converter_returns_request = true;
globalThis.__BUILD_TIMESTAMP_MS__ = ${Date.now()};
`,
    },
  });

  await updateWorkerBundledCode(openNextServerBundle, config, openNextOptions);

  const isMonorepo = monorepoRoot !== appPath;
  if (isMonorepo) {
    fs.writeFileSync(
      path.join(outputPath, "handler.mjs"),
      `export * from "./${normalizePath(packagePath)}/handler.mjs";`
    );
  }

  console.log(`\x1b[35mWorker saved in \`${getOutputWorkerPath(openNextOptions)}\` 🚀\n\x1b[0m`);
}

/**
 * This function applies string replacements on the bundled worker code necessary to get it to run in workerd
 *
 * Needless to say all the logic in this function is something we should avoid as much as possible!
 *
 * @param workerOutputFile
 * @param config
 */
async function updateWorkerBundledCode(
  workerOutputFile: string,
  config: Config,
  openNextOptions: BuildOptions
): Promise<void> {
  const code = await readFile(workerOutputFile, "utf8");

  const patchedCode = await patchCodeWithValidations(code, [
    ["require", patches.patchRequire],
    ["`buildId` function", (code) => patches.patchBuildId(code, config)],
    ["`loadManifest` function", (code) => patches.patchLoadManifest(code, config)],
    ["next's require", (code) => patches.inlineNextRequire(code, config)],
    ["`findDir` function", (code) => patches.patchFindDir(code, config)],
    ["`evalManifest` function", (code) => patches.inlineEvalManifest(code, config)],
    ["cacheHandler", (code) => patches.patchCache(code, openNextOptions)],
    [
      "'require(this.middlewareManifestPath)'",
      (code) => patches.inlineMiddlewareManifestRequire(code, config),
    ],
    ["exception bubbling", patches.patchExceptionBubbling],
    ["`loadInstrumentationModule` function", patches.patchLoadInstrumentationModule],
    [
      "`patchAsyncStorage` call",
      (code) =>
        code
          // TODO: implement for cf (possibly in @opennextjs/aws)
          .replace("patchAsyncStorage();", "//patchAsyncStorage();"),
    ],
    [
      '`eval("require")` calls',
      (code) => code.replaceAll('eval("require")', "require"),
      { isOptional: true },
    ],
    [
      "`require.resolve` call",
      // workers do not support dynamic require nor require.resolve
      (code) => code.replace('require.resolve("./cache.cjs")', '"unused"'),
    ],
  ]);

  await writeFile(workerOutputFile, patchedCode);
}

function createFixRequiresESBuildPlugin(config: Config): Plugin {
  return {
    name: "replaceRelative",
    setup(build) {
      // Note: we (empty) shim require-hook modules as they generate problematic code that uses requires
      build.onResolve({ filter: /^\.(\/|\\)require-hook$/ }, () => ({
        path: path.join(config.paths.internal.templates, "shims", "empty.js"),
      }));
    },
  };
}

/**
 * Applies multiple code patches in order to a given piece of code, at each step it validates that the code
 * has actually been patched/changed, if not an error is thrown
 *
 * @param code the code to apply the patches to
 * @param patches array of tuples, containing a string indicating the target of the patching (for logging) and
 *                a patching function that takes a string (pre-patch code) and returns a string (post-patch code)
 * @returns the patched code
 */
async function patchCodeWithValidations(
  code: string,
  patches: [string, (code: string) => string | Promise<string>, opts?: { isOptional?: boolean }][]
): Promise<string> {
  console.log(`Applying code patches:`);
  let patchedCode = code;

  for (const [target, patchFunction, opts] of patches) {
    console.log(` - patching ${target}`);

    const prePatchCode = patchedCode;
    patchedCode = await patchFunction(patchedCode);

    if (!opts?.isOptional && prePatchCode === patchedCode) {
      throw new Error(`Failed to patch ${target}`);
    }
  }

  console.log(`All ${patches.length} patches applied\n`);
  return patchedCode;
}

/**
 * Gets the path of the worker.js file generated by the build process
 *
 * @param openNextOptions the open-next build options
 * @returns the path of the worker.js file that the build process generates
 */
export function getOutputWorkerPath(openNextOptions: BuildOptions): string {
  return path.join(openNextOptions.outputDir, "worker.js");
}
