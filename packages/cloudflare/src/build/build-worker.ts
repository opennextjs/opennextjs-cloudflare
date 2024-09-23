import { NextjsAppPaths } from "../nextjs-paths";
import { build, Plugin } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";

import { patchRequire } from "./patches/investigated/patch-require";
import { copyTemplates } from "./patches/investigated/copy-templates";

import { patchReadFile } from "./patches/to-investigate/patch-read-file";
import { patchFindDir } from "./patches/to-investigate/patch-find-dir";
import { inlineNextRequire } from "./patches/to-investigate/inline-next-require";
import { inlineEvalManifest } from "./patches/to-investigate/inline-eval-manifest";
import { patchWranglerDeps } from "./patches/to-investigate/wrangler-deps";
import { updateWebpackChunksFile } from "./patches/investigated/update-webpack-chunks-file";

/**
 * Using the Next.js build output in the `.next` directory builds a workerd compatible output
 *
 * @param outputDir the directory where to save the output
 * @param nextjsAppPaths
 */
export async function buildWorker(
  inputNextAppDir: string,
  outputDir: string,
  nextjsAppPaths: NextjsAppPaths,
  templateSrcDir: string
): Promise<void> {
  const templateDir = copyTemplates(templateSrcDir, nextjsAppPaths);

  const workerEntrypoint = `${templateDir}/worker.ts`;
  const workerOutputFile = `${outputDir}/index.mjs`;
  const nextConfigStr =
    readFileSync(nextjsAppPaths.standaloneAppDir + "/server.js", "utf8")?.match(
      /const nextConfig = ({.+?})\n/
    )?.[1] ?? {};

  console.log(`\x1b[35m⚙️ Bundling the worker file...\n\x1b[0m`);

  patchWranglerDeps(nextjsAppPaths);
  updateWebpackChunksFile(nextjsAppPaths);

  await build({
    entryPoints: [workerEntrypoint],
    bundle: true,
    outfile: workerOutputFile,
    format: "esm",
    target: "esnext",
    minify: false,
    plugins: [createFixRequiresESBuildPlugin(templateDir)],
    alias: {
      // Note: we apply an empty shim to next/dist/compiled/ws because it generates two `eval`s:
      //   eval("require")("bufferutil");
      //   eval("require")("utf-8-validate");
      "next/dist/compiled/ws": `${templateDir}/shims/empty.ts`,
      // Note: we apply an empty shim to next/dist/compiled/edge-runtime since (amongst others) it generated the following `eval`:
      //   eval(getModuleCode)(module, module.exports, throwingRequire, params.context, ...Object.values(params.scopedContext));
      //   which comes from https://github.com/vercel/edge-runtime/blob/6e96b55f/packages/primitives/src/primitives/load.js#L57-L63
      // QUESTION: Why did I encountered this but mhart didn't?
      "next/dist/compiled/edge-runtime": `${templateDir}/shims/empty.ts`,
      // `@next/env` is a library Next.js uses for loading dotenv files, for obvious reasons we need to stub it here
      // source: https://github.com/vercel/next.js/tree/0ac10d79720/packages/next-env
      "@next/env": `${templateDir}/shims/env.ts`,
    },
    define: {
      // config file used by Next.js, see: https://github.com/vercel/next.js/blob/68a7128/packages/next/src/build/utils.ts#L2137-L2139
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG": JSON.stringify(nextConfigStr),
      // Next.js tried to access __dirname so we need to define it
      __dirname: '""',
      // Note: we need the __non_webpack_require__ variable declared as it is used by next-server:
      // https://github.com/vercel/next.js/blob/be0c3283/packages/next/src/server/next-server.ts#L116-L119
      __non_webpack_require__: "require",
      // The next.js server can run in minimal mode: https://github.com/vercel/next.js/blob/aa90fe9bb/packages/next/src/server/base-server.ts#L510-L511
      // this avoids some extra (/problematic) `require` calls, such as here: https://github.com/vercel/next.js/blob/aa90fe9bb/packages/next/src/server/next-server.ts#L1259
      // that's wht we enable it
      "process.env.NEXT_PRIVATE_MINIMAL_MODE": "true",
      // Ask mhart if he can explain why the `define`s below are necessary
      "process.env.NEXT_RUNTIME": '"nodejs"',
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_MINIMAL": "true",
    },
    // We need to set platform to node so that esbuild doesn't complain about the node imports
    platform: "node",
    banner: {
      js: `
				${
          /*
					`__dirname` is used by unbundled js files (which don't inherit the `__dirname` present in the `define` field)
					so we also need to set it on the global scope
					Note: this was hit in the `next/dist/compiled/@opentelemetry/api` module
				*/ ""
        }
				globalThis.__dirname ??= "";

// Do not crash on cache not supported
// https://github.com/cloudflare/workerd/pull/2434
// compatibility flag "cache_option_enabled" -> does not support "force-cache"
let isPatchedAlready = globalThis.fetch.__nextPatched;
const curFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  console.log("globalThis.fetch", input);
  if (init) delete init.cache;
  return curFetch(input, init);
};
import { Readable } from 'node:stream';
globalThis.fetch.__nextPatched = isPatchedAlready;
fetch = globalThis.fetch;
const CustomRequest = class extends globalThis.Request {
  constructor(input, init) {
    console.log("CustomRequest", input);
    if (init) {
      delete init.cache;
      if (init.body?.__node_stream__ === true) {
        init.body = Readable.toWeb(init.body);
      }
    }
    super(input, init);
  }
};
globalThis.Request = CustomRequest;
Request = globalThis.Request;
			`,
    },
  });

  await updateWorkerBundledCode(workerOutputFile, nextjsAppPaths);

  console.log(`\x1b[35m⚙️ Copying asset files...\n\x1b[0m`);

  // Copy over client-side generated files
  await cp(`${nextjsAppPaths.dotNextDir}/static`, `${outputDir}/assets/_next/static`, {
    recursive: true,
  });

  // Copy over any static files (e.g. images) from the source project
  if (existsSync(`${inputNextAppDir}/public`)) {
    await cp(`${inputNextAppDir}/public`, `${outputDir}/assets`, {
      recursive: true,
    });
  }

  console.log(`\x1b[35mWorker saved in \`${workerOutputFile}\` 🚀\n\x1b[0m`);
}

/**
 * This function applies string replacements on the bundled worker code necessary to get it to run in workerd
 *
 * Needless to say all the logic in this function is something we should avoid as much as possible!
 *
 * @param workerOutputFile
 * @param nextjsAppPaths
 */
async function updateWorkerBundledCode(
  workerOutputFile: string,
  nextjsAppPaths: NextjsAppPaths
): Promise<void> {
  const originalCode = await readFile(workerOutputFile, "utf8");

  let patchedCode = originalCode;

  patchedCode = patchRequire(patchedCode);
  patchedCode = patchReadFile(patchedCode, nextjsAppPaths);
  patchedCode = inlineNextRequire(patchedCode, nextjsAppPaths);
  patchedCode = patchFindDir(patchedCode, nextjsAppPaths);
  patchedCode = inlineEvalManifest(patchedCode, nextjsAppPaths);

  await writeFile(workerOutputFile, patchedCode);
}

function createFixRequiresESBuildPlugin(templateDir: string): Plugin {
  return {
    name: "replaceRelative",
    setup(build) {
      // Note: we (empty) shim require-hook modules as they generate problematic code that uses requires
      build.onResolve({ filter: /^\.\/require-hook$/ }, (args) => ({
        path: `${templateDir}/shims/empty.ts`,
      }));
      build.onResolve({ filter: /\.\/lib\/node-fs-methods$/ }, (args) => ({
        path: `${templateDir}/shims/node-fs.ts`,
      }));
    },
  };
}
