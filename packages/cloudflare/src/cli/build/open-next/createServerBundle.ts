// Copy-Edit of @opennextjs/aws packages/open-next/src/build/createServerBundle.ts
// Adapted for cloudflare workers

import fs from "node:fs";
import path from "node:path";

import { loadMiddlewareManifest } from "@opennextjs/aws/adapters/config/util.js";
import { bundleNextServer } from "@opennextjs/aws/build/bundleNextServer.js";
import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { copyTracedFiles } from "@opennextjs/aws/build/copyTracedFiles.js";
import { copyMiddlewareResources, generateEdgeBundle } from "@opennextjs/aws/build/edge/createEdgeBundle.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { installDependencies } from "@opennextjs/aws/build/installDeps.js";
import type { CodePatcher } from "@opennextjs/aws/build/patch/codePatcher.js";
import { applyCodePatches } from "@opennextjs/aws/build/patch/codePatcher.js";
import {
  patchFetchCacheForISR,
  patchFetchCacheSetMissingWaitUntil,
  patchUnstableCacheForISR,
} from "@opennextjs/aws/build/patch/patches/index.js";
import logger from "@opennextjs/aws/logger.js";
import { minifyAll } from "@opennextjs/aws/minimize-js.js";
import type { ContentUpdater } from "@opennextjs/aws/plugins/content-updater.js";
import { openNextEdgePlugins } from "@opennextjs/aws/plugins/edge.js";
import { openNextExternalMiddlewarePlugin } from "@opennextjs/aws/plugins/externalMiddleware.js";
import { openNextReplacementPlugin } from "@opennextjs/aws/plugins/replacement.js";
import { openNextResolvePlugin } from "@opennextjs/aws/plugins/resolve.js";
import type { FunctionOptions, SplittedFunctionOptions } from "@opennextjs/aws/types/open-next.js";
import { getCrossPlatformPathRegex } from "@opennextjs/aws/utils/regex.js";
import type { Plugin } from "esbuild";

import { patchResRevalidate } from "../patches/plugins/res-revalidate.js";
import { normalizePath } from "../utils/index.js";

interface CodeCustomization {
  // These patches are meant to apply on user and next generated code
  additionalCodePatches?: CodePatcher[];
  // These plugins are meant to apply during the esbuild bundling process.
  // This will only apply to OpenNext code.
  additionalPlugins?: (contentUpdater: ContentUpdater) => Plugin[];
}

export async function createServerBundle(
  options: buildHelper.BuildOptions,
  codeCustomization?: CodeCustomization
) {
  const { config } = options;
  const foundRoutes = new Set<string>();
  // Get all functions to build
  const defaultFn = config.default;
  const functions = Object.entries(config.functions ?? {});

  // Recompile cache.ts as ESM if any function is using Deno runtime
  if (defaultFn.runtime === "deno" || functions.some(([, fn]) => fn.runtime === "deno")) {
    compileCache(options, "esm");
  }

  const promises = functions.map(async ([name, fnOptions]) => {
    const routes = fnOptions.routes;
    routes.forEach((route) => foundRoutes.add(route));
    if (fnOptions.runtime === "edge") {
      await generateEdgeBundle(name, options, fnOptions);
    } else {
      await generateBundle(name, options, fnOptions, codeCustomization);
    }
  });

  //TODO: throw an error if not all edge runtime routes has been bundled in a separate function

  // We build every other function than default before so we know which route there is left
  await Promise.all(promises);

  const remainingRoutes = new Set<string>();

  const { appBuildOutputPath } = options;

  // Find remaining routes
  const serverPath = path.join(
    appBuildOutputPath,
    ".next/standalone",
    buildHelper.getPackagePath(options),
    ".next/server"
  );

  // Find app dir routes
  if (fs.existsSync(path.join(serverPath, "app"))) {
    const appPath = path.join(serverPath, "app");
    buildHelper.traverseFiles(
      appPath,
      ({ relativePath }) => relativePath.endsWith("page.js") || relativePath.endsWith("route.js"),
      ({ relativePath }) => {
        const route = `app/${relativePath.replace(/\.js$/, "")}`;
        if (!foundRoutes.has(route)) {
          remainingRoutes.add(route);
        }
      }
    );
  }

  // Find pages dir routes
  if (fs.existsSync(path.join(serverPath, "pages"))) {
    const pagePath = path.join(serverPath, "pages");
    buildHelper.traverseFiles(
      pagePath,
      ({ relativePath }) => relativePath.endsWith(".js"),
      ({ relativePath }) => {
        const route = `pages/${relativePath.replace(/\.js$/, "")}`;
        if (!foundRoutes.has(route)) {
          remainingRoutes.add(route);
        }
      }
    );
  }

  // Generate default function
  await generateBundle("default", options, {
    ...defaultFn,
    // @ts-expect-error - Those string are RouteTemplate
    routes: Array.from(remainingRoutes),
    patterns: ["*"],
  });
}

async function generateBundle(
  name: string,
  options: buildHelper.BuildOptions,
  fnOptions: SplittedFunctionOptions,
  codeCustomization?: CodeCustomization
) {
  const { appPath, appBuildOutputPath, config, outputDir, monorepoRoot } = options;
  logger.info(`Building server function: ${name}...`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-functions", name);

  // Resolve path to the Next.js app if inside the monorepo
  // note: if user's app is inside a monorepo, standalone mode places
  //       `node_modules` inside `.next/standalone`, and others inside
  //       `.next/standalone/package/path` (ie. `.next`, `server.js`).
  //       We need to output the handler file inside the package path.
  const packagePath = buildHelper.getPackagePath(options);
  const outPackagePath = path.join(outputPath, packagePath);
  fs.mkdirSync(outPackagePath, { recursive: true });

  const ext = fnOptions.runtime === "deno" ? "mjs" : "cjs";
  fs.copyFileSync(path.join(options.buildDir, `cache.${ext}`), path.join(outPackagePath, "cache.cjs"));

  if (fnOptions.runtime === "deno") {
    addDenoJson(outputPath, packagePath);
  }

  // Bundle next server if necessary
  const isBundled = fnOptions.experimentalBundledNextServer ?? false;
  if (isBundled) {
    await bundleNextServer(outPackagePath, appPath, {
      minify: options.minify,
    });
  }

  // Copy middleware
  if (!config.middleware?.external) {
    fs.copyFileSync(
      path.join(options.buildDir, "middleware.mjs"),
      path.join(outPackagePath, "middleware.mjs")
    );

    const middlewareManifest = loadMiddlewareManifest(path.join(options.appBuildOutputPath, ".next"));

    copyMiddlewareResources(options, middlewareManifest.middleware["/"], outPackagePath);
  }

  // Copy open-next.config.mjs
  buildHelper.copyOpenNextConfig(options.buildDir, outPackagePath, true);

  // Copy env files
  buildHelper.copyEnvFile(appBuildOutputPath, packagePath, outputPath);

  // Copy all necessary traced files
  const { tracedFiles, manifests } = await copyTracedFiles({
    buildOutputPath: appBuildOutputPath,
    packagePath,
    outputDir: outputPath,
    routes: fnOptions.routes ?? ["app/page.tsx"],
    bundledNextServer: isBundled,
  });

  const additionalCodePatches = codeCustomization?.additionalCodePatches ?? [];

  await applyCodePatches(options, tracedFiles, manifests, [
    patchFetchCacheSetMissingWaitUntil,
    patchFetchCacheForISR,
    patchUnstableCacheForISR,
    // Cloudflare specific patches
    patchResRevalidate,
    ...additionalCodePatches,
  ]);

  // Build Lambda code
  // note: bundle in OpenNext package b/c the adapter relies on the
  //       "serverless-http" package which is not a dependency in user's
  //       Next.js app.

  const disableNextPrebundledReact =
    buildHelper.compareSemver(options.nextVersion, ">=", "13.5.1") ||
    buildHelper.compareSemver(options.nextVersion, "<=", "13.4.1");

  const overrides = fnOptions.override ?? {};

  const isBefore13413 = buildHelper.compareSemver(options.nextVersion, "<=", "13.4.13");
  const isAfter141 = buildHelper.compareSemver(options.nextVersion, ">=", "14.1");
  const isAfter142 = buildHelper.compareSemver(options.nextVersion, ">=", "14.2");

  const disableRouting = isBefore13413 || config.middleware?.external;

  const plugins = [
    openNextReplacementPlugin({
      name: `requestHandlerOverride ${name}`,
      target: getCrossPlatformPathRegex("core/requestHandler.js"),
      deletes: [
        ...(disableNextPrebundledReact ? ["applyNextjsPrebundledReact"] : []),
        ...(disableRouting ? ["withRouting"] : []),
        ...(isAfter142 ? ["patchAsyncStorage"] : []),
      ],
    }),
    openNextReplacementPlugin({
      name: `utilOverride ${name}`,
      target: getCrossPlatformPathRegex("core/util.js"),
      deletes: [
        ...(disableNextPrebundledReact ? ["requireHooks"] : []),
        ...(isBefore13413 ? ["trustHostHeader"] : ["requestHandlerHost"]),
        ...(isAfter141 ? ["experimentalIncrementalCacheHandler"] : ["stableIncrementalCache"]),
      ],
    }),

    openNextResolvePlugin({
      fnName: name,
      overrides,
    }),

    // `openNextExternalMiddlewarePlugin` should only be used with an external middleware
    ...(config.middleware?.external
      ? [openNextExternalMiddlewarePlugin(path.join(options.openNextDistDir, "core/edgeFunctionHandler.js"))]
      : []),

    openNextEdgePlugins({
      nextDir: path.join(options.appBuildOutputPath, ".next"),
      isInCloudflare: true,
    }),
  ];

  const outfileExt = fnOptions.runtime === "deno" ? "ts" : "mjs";
  await buildHelper.esbuildAsync(
    {
      entryPoints: [path.join(options.openNextDistDir, "adapters", "server-adapter.js")],
      outfile: path.join(outputPath, packagePath, `index.${outfileExt}`),
      external: ["./middleware.mjs"],
      banner: {
        js: [
          `globalThis.monorepoPackagePath = "${normalizePath(packagePath)}";`,
          name === "default" ? "" : `globalThis.fnName = "${name}";`,
        ].join(""),
      },
      plugins,
      alias: {
        ...(isBundled
          ? {
              "next/dist/server/next-server.js": "./next-server.runtime.prod.js",
            }
          : {}),
      },
    },
    options
  );

  const isMonorepo = monorepoRoot !== appPath;
  if (isMonorepo) {
    addMonorepoEntrypoint(outputPath, packagePath);
  }

  installDependencies(outputPath, fnOptions.install);

  if (fnOptions.minify) {
    await minifyServerBundle(outputPath);
  }

  const shouldGenerateDocker = shouldGenerateDockerfile(fnOptions);
  if (shouldGenerateDocker) {
    fs.writeFileSync(
      path.join(outputPath, "Dockerfile"),
      typeof shouldGenerateDocker === "string"
        ? shouldGenerateDocker
        : `
FROM node:18-alpine
WORKDIR /app
COPY . /app
EXPOSE 3000
CMD ["node", "index.mjs"]
    `
    );
  }
}

function shouldGenerateDockerfile(options: FunctionOptions) {
  return options.override?.generateDockerfile ?? false;
}

// Add deno.json file to enable "bring your own node_modules" mode.
// TODO: this won't be necessary in Deno 2. See https://github.com/denoland/deno/issues/23151
function addDenoJson(outputPath: string, packagePath: string) {
  const config = {
    // Enable "bring your own node_modules" mode
    // and allow `__proto__`
    unstable: ["byonm", "fs", "unsafe-proto"],
  };
  fs.writeFileSync(path.join(outputPath, packagePath, "deno.json"), JSON.stringify(config, null, 2));
}

//TODO: check if this PR is still necessary https://github.com/opennextjs/opennextjs-aws/pull/341
function addMonorepoEntrypoint(outputPath: string, packagePath: string) {
  // Note: in the monorepo case, the handler file is output to
  //       `.next/standalone/package/path/index.mjs`, but we want
  //       the Lambda function to be able to find the handler at
  //       the root of the bundle. We will create a dummy `index.mjs`
  //       that re-exports the real handler.

  fs.writeFileSync(
    path.join(outputPath, "index.mjs"),
    `export { handler } from "./${normalizePath(packagePath)}/index.mjs";`
  );
}

async function minifyServerBundle(outputDir: string) {
  logger.info("Minimizing server function...");

  await minifyAll(outputDir, {
    compress_json: true,
    mangle: true,
  });
}
