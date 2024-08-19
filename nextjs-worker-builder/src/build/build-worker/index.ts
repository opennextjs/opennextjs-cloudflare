import { NextjsAppPaths } from "../../nextjsPaths";
import { build, Plugin } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";

let fixRequires: Plugin = {
  name: "replaceRelative",
  setup(build) {
    // Note: we (empty) shim require-hook modules as they generate problematic code that uses requires
    build.onResolve({ filter: /^\.\/require-hook$/ }, (args) => ({
      path: `${import.meta.dirname}/templates/shims/empty.ts`,
    }));
  },
};

/**
 * Using the Next.js build output in the `.next` directory builds a workerd compatible output
 *
 * @param outputDir the directory where to save the output
 * @param nextjsAppPaths
 */
export async function buildWorker(
  outputDir: string,
  nextjsAppPaths: NextjsAppPaths
): Promise<void> {
  console.log();

  // ultra hack! to solve (maybe with Pete's help)
  const problematicUnenvFile =
    "/Users/dario/Desktop/poc-build-nextjs-app-for-cf-workers/node_modules/.pnpm/unenv-nightly@1.10.0-1717606461.a117952/node_modules/unenv-nightly/runtime/node/process/$cloudflare.mjs";
  const originalProblematicUnenvFileContent = readFileSync(
    problematicUnenvFile,
    "utf-8"
  );
  writeFileSync(
    problematicUnenvFile,
    originalProblematicUnenvFileContent.replace(
      'const unpatchedGlobalThisProcess = globalThis["process"];',
      'const unpatchedGlobalThisProcess = global.process; /* 👈 original line: `const unpatchedGlobalThisProcess = globalThis["process"]` */'
    )
  );
  // ultra hack! to solve (maybe with Pete's help)
  // IMPORTANT: this is coming from the usage of the old school assets! we should not do that anyways!
  const problematicKvAssetHandler =
    "/Users/dario/Desktop/poc-build-nextjs-app-for-cf-workers/node_modules/.pnpm/@cloudflare+kv-asset-handler@0.3.4/node_modules/@cloudflare/kv-asset-handler/dist/index.js";
  const originalProblematicKvAssetHandlerContent = readFileSync(
    problematicKvAssetHandler,
    "utf-8"
  );
  writeFileSync(
    problematicKvAssetHandler,
    originalProblematicKvAssetHandlerContent.replace(
      'const mime = __importStar(require("mime"));',
      'let mime = __importStar(require("mime")); mime = mime.default ?? mime;'
    )
  );

  const workerEntrypoint = `${import.meta.dirname}/templates/worker.ts`;
  const workerOutputFile = `${outputDir}/index.mjs`;
  const nextConfigStr =
    readFileSync(nextjsAppPaths.standaloneAppDir + "/server.js", "utf8")?.match(
      /const nextConfig = ({.+?})\n/
    )?.[1] ?? {};

  console.log(`\x1b[35m⚙️ Bundling the worker file...\n\x1b[0m`);
  await build({
    entryPoints: [workerEntrypoint],
    bundle: true,
    outfile: workerOutputFile,
    format: "esm",
    target: "esnext",
    minify: false,
    plugins: [fixRequires],
    alias: {
      // Note: we (empty) shim next/dist/compiled/ws because it generates two `eval`s:
      //   eval("require")("bufferutil");
      //   eval("require")("utf-8-validate");
      "next/dist/compiled/ws": `${
        import.meta.dirname
      }/templates/shims/empty.ts`,
      // Note: we (empty) shim next/dist/compiled/edge-runtime since (amongst others) it generated the following `eval`:
      //   eval(getModuleCode)(module, module.exports, throwingRequire, params.context, ...Object.values(params.scopedContext));
      //   which comes from https://github.com/vercel/edge-runtime/blob/6e96b55f/packages/primitives/src/primitives/load.js#L57-L63
      // QUESTION: Why did I encountered this but mhart didn't?
      "next/dist/compiled/edge-runtime": `${
        import.meta.dirname
      }/templates/shims/empty.ts`,
      ///
      ///
      ///
      ///
      ///
      // 'next/dist/experimental/testmode/server': `${import.meta.dirname}/shims/empty.mjs`,
      // 'next/dist/compiled/node-html-parser': `${import.meta.dirname}/shim-empty.mjs`,
      // '@next/env': `${import.meta.dirname}/shim-env.mjs`,
      // '@opentelemetry/api': `${import.meta.dirname}/shim-throw.mjs`,
    },
    define: {
      // config file used by Next.js, see: https://github.com/vercel/next.js/blob/68a7128/packages/next/src/build/utils.ts#L2137-L2139
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG":
        JSON.stringify(nextConfigStr),
      // Next.js tried to access __dirname so we need to define it
      __dirname: '""',
      // Note: we need the __non_webpack_require__ variable declared as it is used by next-server:
      // https://github.com/vercel/next.js/blob/be0c3283/packages/next/src/server/next-server.ts#L116-L119
      __non_webpack_require__: "require",
      // Ask mhart if he can explain why the `define`s below are necessary
      "process.env.NEXT_RUNTIME": '"nodejs"',
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_MINIMAL": "true",
      // "process.env.NEXT_PRIVATE_MINIMAL_MODE": "true",
    },
    // We need to set platform to node so that esbuild doesn't complain about the node imports
    platform: "node",
  });

  // ultra hack
  const workerContents = await readFile(workerOutputFile, "utf8");
  const updatedWorkerContents = workerContents
    .replace(/__require\d?\(/g, "require(")
    .replace(/__require\d?\./g, "require.");
  await writeFile(workerOutputFile, updatedWorkerContents);

  console.log(`\x1b[35m⚙️ Copying asset files...\n\x1b[0m`);
  await cp(`${nextjsAppPaths.dotNextDir}/static`, `${outputDir}/assets/_next`, {
    recursive: true,
  });

  console.log(`\x1b[35mWorker saved in \`${workerOutputFile}\` 🚀\n\x1b[0m`);
}
