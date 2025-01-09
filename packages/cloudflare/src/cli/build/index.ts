import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { buildNextjsApp, setStandaloneBuildMode } from "@opennextjs/aws/build/buildNextApp.js";
import { compileCache } from "@opennextjs/aws/build/compileCache.js";
import { compileOpenNextConfig } from "@opennextjs/aws/build/compileConfig.js";
import { createCacheAssets, createStaticAssets } from "@opennextjs/aws/build/createAssets.js";
import { createMiddleware } from "@opennextjs/aws/build/createMiddleware.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import { printHeader, showWarningOnWindows } from "@opennextjs/aws/build/utils.js";
import logger from "@opennextjs/aws/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import type { ProjectOptions } from "../config.js";
import { containsDotNextDir, getConfig } from "../config.js";
import { askConfirmation } from "../utils/ask-confirmation.js";
import { bundleServer } from "./bundle-server.js";
import { compileEnvFiles } from "./open-next/compile-env-files.js";
import { copyCacheAssets } from "./open-next/copyCacheAssets.js";
import { createServerBundle } from "./open-next/createServerBundle.js";

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

  await createOpenNextConfigIfNotExistent(projectOpts);

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
  ensureNextjsVersionSupported(options);
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

  if (config.dangerous?.disableIncrementalCache !== true) {
    createCacheAssets(options);
    copyCacheAssets(options);
  }

  await createServerBundle(options);

  // TODO: drop this copy.
  // Copy the .next directory to the output directory so it can be mutated.
  cpSync(join(projectOpts.sourceDir, ".next"), join(projectOpts.outputDir, ".next"), { recursive: true });

  const projConfig = getConfig(projectOpts);

  // TODO: rely on options only.
  await bundleServer(projConfig, options);

  if (!projectOpts.skipWranglerConfigCheck) {
    await createWranglerConfigIfNotExistent(projectOpts);
  }

  logger.info("OpenNext build complete.");
}

/**
 * Creates a `open-next.config.ts` file for the user if it doesn't exist, but only after asking for the user's confirmation.
 *
 * If the user refuses an error is thrown (since the file is mandatory).
 *
 * @param projectOpts The options for the project
 */
async function createOpenNextConfigIfNotExistent(projectOpts: ProjectOptions): Promise<void> {
  const openNextConfigPath = join(projectOpts.sourceDir, "open-next.config.ts");

  if (!existsSync(openNextConfigPath)) {
    const answer = await askConfirmation(
      "Missing required `open-next.config.ts` file, do you want to create one?"
    );

    if (!answer) {
      throw new Error("The `open-next.config.ts` file is required, aborting!");
    }

    cpSync(join(getPackageTemplatesDirPath(), "defaults", "open-next.config.ts"), openNextConfigPath);
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
    dftMaybeUseCache:
      config.default?.override?.incrementalCache === "dummy" ||
      typeof config.default?.override?.incrementalCache === "function",
    dftUseDummyTagCacheAndQueue:
      config.default?.override?.tagCache === "dummy" && config.default?.override?.queue === "dummy",
    disableCacheInterception: config.dangerous?.enableCacheInterception !== true,
    mwIsMiddlewareExternal: config.middleware?.external == true,
    mwUseCloudflareWrapper: config.middleware?.override?.wrapper === "cloudflare-edge",
    mwUseEdgeConverter: config.middleware?.override?.converter === "edge",
    mwUseFetchProxy: config.middleware?.override?.proxyExternalRequest === "fetch",
  };

  if (Object.values(requirements).some((satisfied) => !satisfied)) {
    throw new Error(
      "The `open-next.config.ts` should have a default export like this:\n\n" +
        `{
          default: {
            override: {
              wrapper: "cloudflare-node",
              converter: "edge",
              incrementalCache: "dummy" | function,
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
          },
        }\n\n`.replace(/^ {8}/gm, "")
    );
  }
}

/**
 * Creates a `wrangler.json` file for the user if a wrangler config file doesn't already exist,
 * but only after asking for the user's confirmation.
 *
 * If the user refuses a warning is shown (which offers ways to opt out of this check to the user).
 *
 * Note: we generate a wrangler.json file with comments instead of using the jsonc extension,
 *       we decided to do that since json is more common than jsonc, wrangler also parses
 *       them in the same way and we also expect developers to associate `wrangler.json`
 *       files to the jsonc language
 *
 * @param projectOpts The options for the project
 */
async function createWranglerConfigIfNotExistent(projectOpts: ProjectOptions): Promise<void> {
  const possibleExts = ["toml", "json", "jsonc"];

  const wranglerConfigFileExists = possibleExts.some((ext) =>
    existsSync(join(projectOpts.sourceDir, `wrangler.${ext}`))
  );
  if (wranglerConfigFileExists) {
    return;
  }

  const answer = await askConfirmation(
    "No `wrangler.(toml|json|jsonc)` config file found, do you want to create one?"
  );

  if (!answer) {
    console.warn(
      "No Wrangler config file created" +
        "\n" +
        "(to avoid this check use the `--skipWranglerConfigCheck` flag or set a `SKIP_WRANGLER_CONFIG_CHECK` environment variable to `yes`)"
    );
    return;
  }

  const wranglerConfigTemplate = readFileSync(
    join(getPackageTemplatesDirPath(), "defaults", "wrangler.jsonc"),
    "utf8"
  );
  let wranglerConfigContent = wranglerConfigTemplate;

  const appName = getAppNameFromPackageJson(projectOpts.sourceDir) ?? "app-name";
  if (appName) {
    wranglerConfigContent = wranglerConfigContent.replace(
      '"app-name"',
      JSON.stringify(appName.replaceAll("_", "-"))
    );
  }

  const compatDate = await getLatestCompatDate();
  if (compatDate) {
    wranglerConfigContent = wranglerConfigContent.replace(
      /"compatibility_date": "\d{4}-\d{2}-\d{2}"/,
      `"compatibility_date": ${JSON.stringify(compatDate)}`
    );
  }

  writeFileSync(join(projectOpts.sourceDir, "wrangler.json"), wranglerConfigContent);
}

function getAppNameFromPackageJson(sourceDir: string): string | undefined {
  try {
    const packageJsonStr = readFileSync(join(sourceDir, "package.json"), "utf8");
    const packageJson: Record<string, string> = JSON.parse(packageJsonStr);
    if (typeof packageJson.name === "string") return packageJson.name;
  } catch {
    /* empty */
  }
}

export async function getLatestCompatDate(): Promise<string | undefined> {
  try {
    const resp = await fetch(`https://registry.npmjs.org/workerd`);
    const latestWorkerdVersion = (
      (await resp.json()) as {
        "dist-tags": { latest: string };
      }
    )["dist-tags"].latest;

    // The format of the workerd version is `major.yyyymmdd.patch`.
    const match = latestWorkerdVersion.match(/\d+\.(\d{4})(\d{2})(\d{2})\.\d+/);

    if (match) {
      const [, year, month, date] = match;
      const compatDate = `${year}-${month}-${date}`;

      return compatDate;
    }
  } catch {
    /* empty */
  }
}

function ensureNextjsVersionSupported(options: buildHelper.BuildOptions) {
  if (buildHelper.compareSemver(options.nextVersion, "14.0.0") < 0) {
    logger.error("Next.js version unsupported, please upgrade to version 14 or greater.");
    process.exit(1);
  }
}
