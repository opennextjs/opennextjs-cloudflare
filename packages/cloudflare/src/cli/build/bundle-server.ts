import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type BuildOptions, getPackagePath } from "@opennextjs/aws/build/helper.js";
import { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import { build, type Plugin } from "esbuild";

import { patchVercelOgLibrary } from "./patches/ast/patch-vercel-og-library.js";
import { patchWebpackRuntime } from "./patches/ast/webpack-runtime.js";
import * as patches from "./patches/index.js";
import { inlineBuildId } from "./patches/plugins/build-id.js";
import { inlineDynamicRequires } from "./patches/plugins/dynamic-requires.js";
import { inlineEvalManifest } from "./patches/plugins/eval-manifest.js";
import { inlineFindDir } from "./patches/plugins/find-dir.js";
import { patchInstrumentation } from "./patches/plugins/instrumentation.js";
import { inlineLoadManifest } from "./patches/plugins/load-manifest.js";
import { patchNextMinimal } from "./patches/plugins/next-minimal.js";
import { handleOptionalDependencies } from "./patches/plugins/optional-deps.js";
import { patchDepdDeprecations } from "./patches/plugins/patch-depd-deprecations.js";
import { fixRequire } from "./patches/plugins/require.js";
import { shimRequireHook } from "./patches/plugins/require-hook.js";
import { setWranglerExternal } from "./patches/plugins/wrangler-external.js";
import { needsExperimentalReact, normalizePath, patchCodeWithValidations } from "./utils/index.js";

/** The dist directory of the Cloudflare adapter package */
const packageDistDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * List of optional Next.js dependencies.
 * They are not required for Next.js to run but only needed to enabled specific features.
 * When one of those dependency is required, it should be installed by the application.
 */
const optionalDependencies = [
  "caniuse-lite",
  "critters",
  "jimp",
  "probe-image-size",
  // `server.edge` is not available in react-dom@18
  "react-dom/server.edge",
];

/**
 * Bundle the Open Next server.
 */
export async function bundleServer(buildOpts: BuildOptions): Promise<void> {
  patches.copyPackageCliFiles(packageDistDir, buildOpts);

  const { appPath, outputDir, monorepoRoot } = buildOpts;
  const baseManifestPath = path.join(
    outputDir,
    "server-functions/default",
    getPackagePath(buildOpts),
    ".next"
  );
  const serverFiles = path.join(baseManifestPath, "required-server-files.json");
  const nextConfig = JSON.parse(fs.readFileSync(serverFiles, "utf-8")).config;

  console.log(`\x1b[35m⚙️ Bundling the OpenNext server...\n\x1b[0m`);

  await patchWebpackRuntime(buildOpts);
  patchVercelOgLibrary(buildOpts);

  const outputPath = path.join(outputDir, "server-functions", "default");
  const packagePath = getPackagePath(buildOpts);
  const openNextServer = path.join(outputPath, packagePath, `index.mjs`);
  const openNextServerBundle = path.join(outputPath, packagePath, `handler.mjs`);

  const updater = new ContentUpdater(buildOpts);

  const result = await build({
    entryPoints: [openNextServer],
    bundle: true,
    outfile: openNextServerBundle,
    format: "esm",
    target: "esnext",
    minify: false,
    metafile: true,
    // Next traces files using the default conditions from `nft` (`node`, `require`, `import` and `default`)
    //
    // Because we use the `node` platform for this build, the "module" condition is used when no conditions are defined.
    // We explicitly set the conditions to an empty array to disable the "module" condition in order to match Next tracing.
    //
    // See:
    // - default nft conditions: https://github.com/vercel/nft/blob/2b55b01/readme.md#exports--imports
    // - Next no explicit override: https://github.com/vercel/next.js/blob/2efcf11/packages/next/src/build/collect-build-traces.ts#L287
    // - ESBuild `node` platform: https://esbuild.github.io/api/#platform
    conditions: [],
    plugins: [
      shimRequireHook(buildOpts),
      inlineDynamicRequires(updater, buildOpts),
      setWranglerExternal(),
      fixRequire(updater),
      handleOptionalDependencies(optionalDependencies),
      patchInstrumentation(updater, buildOpts),
      inlineEvalManifest(updater, buildOpts),
      inlineFindDir(updater, buildOpts),
      inlineLoadManifest(updater, buildOpts),
      inlineBuildId(updater),
      patchDepdDeprecations(updater),
      patchNextMinimal(updater),
      // Apply updater updates, must be the last plugin
      updater.plugin,
    ] as Plugin[],
    external: ["./middleware/handler.mjs", "*.wasm"],
    alias: {
      // Note: it looks like node-fetch is actually not necessary for us, so we could replace it with an empty shim
      //       but just to be safe we replace it with a module that re-exports the native fetch
      //       we do this to both save on bundle size (there isn't really any benefit in us shipping the node-fetch code)
      //       and also get rid of a warning in the terminal caused by the package (because it performs an === comparison with -0)
      "next/dist/compiled/node-fetch": path.join(buildOpts.outputDir, "cloudflare-templates/shims/fetch.js"),
      // Note: we apply an empty shim to next/dist/compiled/ws because it generates two `eval`s:
      //   eval("require")("bufferutil");
      //   eval("require")("utf-8-validate");
      "next/dist/compiled/ws": path.join(buildOpts.outputDir, "cloudflare-templates/shims/empty.js"),
      // Note: we apply an empty shim to next/dist/compiled/edge-runtime since (amongst others) it generated the following `eval`:
      //   eval(getModuleCode)(module, module.exports, throwingRequire, params.context, ...Object.values(params.scopedContext));
      //   which comes from https://github.com/vercel/edge-runtime/blob/6e96b55f/packages/primitives/src/primitives/load.js#L57-L63
      "next/dist/compiled/edge-runtime": path.join(
        buildOpts.outputDir,
        "cloudflare-templates/shims/empty.js"
      ),
      // `@next/env` is a library Next.js uses for loading dotenv files, for obvious reasons we need to stub it here
      // source: https://github.com/vercel/next.js/tree/0ac10d79720/packages/next-env
      "@next/env": path.join(buildOpts.outputDir, "cloudflare-templates/shims/env.js"),
    },
    define: {
      // config file used by Next.js, see: https://github.com/vercel/next.js/blob/68a7128/packages/next/src/build/utils.ts#L2137-L2139
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG": JSON.stringify(JSON.stringify(nextConfig)),
      // Next.js tried to access __dirname so we need to define it
      __dirname: '""',
      // Note: we need the __non_webpack_require__ variable declared as it is used by next-server:
      // https://github.com/vercel/next.js/blob/be0c3283/packages/next/src/server/next-server.ts#L116-L119
      __non_webpack_require__: "require",
      // We make sure that environment variables that Next.js expects are properly defined
      "process.env.NEXT_RUNTIME": '"nodejs"',
      "process.env.NODE_ENV": '"production"',
      // The 2 following defines are used to reduce the bundle size by removing unnecessary code
      // Next uses different precompiled renderers (i.e. `app-page.runtime.prod.js`) based on if you use `TURBOPACK` or some experimental React features
      // Turbopack is not supported for build at the moment, so we disable it
      "process.env.TURBOPACK": "false",
      // This define should be safe to use for Next 14.2+, earlier versions (13.5 and less) will cause trouble
      "process.env.__NEXT_EXPERIMENTAL_REACT": `${needsExperimentalReact(nextConfig)}`,
    },
    platform: "node",
  });

  fs.writeFileSync(openNextServerBundle + ".meta.json", JSON.stringify(result.metafile, null, 2));

  await updateWorkerBundledCode(openNextServerBundle, buildOpts);

  const isMonorepo = monorepoRoot !== appPath;
  if (isMonorepo) {
    fs.writeFileSync(
      path.join(outputPath, "handler.mjs"),
      `export { handler } from "./${normalizePath(packagePath)}/handler.mjs";`
    );
  }

  console.log(`\x1b[35mWorker saved in \`${getOutputWorkerPath(buildOpts)}\` 🚀\n\x1b[0m`);
}

/**
 * This function applies patches required for the code to run on workers.
 */
export async function updateWorkerBundledCode(
  workerOutputFile: string,
  buildOpts: BuildOptions
): Promise<void> {
  const code = await readFile(workerOutputFile, "utf8");

  const patchedCode = await patchCodeWithValidations(code, [
    ["require", patches.patchRequire],
    ["cacheHandler", (code) => patches.patchCache(code, buildOpts)],
    [
      "'require(this.middlewareManifestPath)'",
      (code) => patches.inlineMiddlewareManifestRequire(code, buildOpts),
    ],
    [
      "`require.resolve` call",
      // workers do not support dynamic require nor require.resolve
      (code) => code.replace('require.resolve("./cache.cjs")', '"unused"'),
    ],
  ]);

  await writeFile(workerOutputFile, patchedCode);
}

/**
 * Gets the path of the worker.js file generated by the build process
 *
 * @param buildOpts the open-next build options
 * @returns the path of the worker.js file that the build process generates
 */
export function getOutputWorkerPath(buildOpts: BuildOptions): string {
  return path.join(buildOpts.outputDir, "worker.js");
}
