import { cpSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { buildNextjsApp, setStandaloneBuildMode } from "@opennextjs/aws/build/buildNextApp.js";
import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import Enquirer from "enquirer";

import type { ProjectOptions } from "../config";
import { containsDotNextDir, getConfig } from "../config";
import { bundleServer } from "./bundle-server";
import { compileEnvFiles } from "./open-next/compile-env-files";
import { createServerBundle } from "./open-next/createServerBundle";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param projectOpts The options for the project
 */
export async function build(projectOpts: ProjectOptions): Promise<void> {
  printHeader("Cloudflare build");

  showWarningOnWindows();

  const baseDir = projectOpts.sourceDir;
  const require = createRequire(import.meta.url);
  const openNextDistDir = dirname(require.resolve("@opennextjs/aws/index.js"));

  await createOpenNextConfigIfNotExistent(baseDir);

  const { config, buildDir } = await compileOpenNextConfig(baseDir);

  ensureCloudflareConfig(config);

  // Initialize options
  const options = buildHelper.normalizeOptions(config, openNextDistDir, buildDir);
  logger.setLevel(options.debug ? "debug" : "info");

  // Do not minify the code so that we can apply string replacement patch.
  // Note that wrangler will still minify the bundle.
  options.minify = false;

  // Pre-build validation
  buildHelper.checkRunningInsideNextjsApp(options);
  logger.info(`App directory: ${options.appPath}`);
  buildHelper.printNextjsVersion(options);
  buildHelper.printOpenNextVersion(options);

  if (projectOpts.skipNextBuild) {
    logger.warn("Skipping Next.js build");
  } else {
    // Build the next app
    printHeader("Building Next.js app");
    setStandaloneBuildMode(options);
    buildNextjsApp(options);
  }

  if (!containsDotNextDir(projectOpts.sourceDir)) {
    throw new Error(`.next folder not found in ${projectOpts.sourceDir}`);
  }

  // Generate deployable bundle
  printHeader("Generating bundle");
  buildHelper.initOutputDir(options);

  // Compile cache.ts
  compileCache(options);

  // Compile .env files
  compileEnvFiles(options);

  // Compile middleware
  await createMiddleware(options, { forceOnlyBuildOnce: true });

  createStaticAssets(options);

  await createServerBundle(options);

  // TODO: drop this copy.
  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(join(projectOpts.sourceDir, ".next"), join(projectOpts.outputDir, ".next"), { recursive: true });

  const projConfig = getConfig(projectOpts);

  // TODO: rely on options only.
  await bundleServer(projConfig, options);

  logger.info("OpenNext build complete.");
}

/**
 * Creates a `open-next.config.ts` file for the user if it doesn't exist, but only after getting the user's confirmation.
 *
 * If the users refuses an error is thrown (since the file is mandatory).
 *
 * @param baseDir the Next.js app root folder
 */
async function createOpenNextConfigIfNotExistent(baseDir: string): Promise<void> {
  const openNextConfigPath = join(baseDir, "open-next.config.ts");

  if (!existsSync(openNextConfigPath)) {
    const questionName = "create-open-next-config";
    const answer = (
      (await Enquirer.prompt({
        name: "create-open-next-config",
        message: "Missing required `open-next.config.ts` file, do you want to create one?",
        type: "confirm",
        initial: "y",
      })) as { [questionName]: boolean }
    )[questionName];
    if (!answer) {
      throw new Error("A `open-next.config.ts` file is mandatory, aborting!");
    }

    cpSync(`${import.meta.dirname}/templates/defaults/open-next.config.ts`, openNextConfigPath);
  }
}

/**
 * Ensures open next is configured for cloudflare.
 *
 * @param config OpenNext configuration.
 */
function ensureCloudflareConfig(config: OpenNextConfig) {
  const requirements = {
    dftUseCloudflareWrapper: config.default?.override?.wrapper === "cloudflare-node",
    dftUseEdgeConverter: config.default?.override?.converter === "edge",
    dftUseDummyCache:
      config.default?.override?.incrementalCache === "dummy" &&
      config.default?.override?.tagCache === "dummy" &&
      config.default?.override?.queue === "dummy",
    disableCacheInterception: config.dangerous?.enableCacheInterception !== true,
    mwIsMiddlewareExternal: config.middleware?.external == true,
    mwUseCloudflareWrapper: config.middleware?.override?.wrapper === "cloudflare-edge",
    mwUseEdgeConverter: config.middleware?.override?.converter === "edge",
    mwUseFetchProxy: config.middleware?.override?.proxyExternalRequest === "fetch",
  };

  if (Object.values(requirements).some((satisfied) => !satisfied)) {
    throw new Error(`open-next.config.ts should contain:
{
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },

  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
    },
  },

  "dangerous": {
    "enableCacheInterception": false
  }
}`);
  }
}
