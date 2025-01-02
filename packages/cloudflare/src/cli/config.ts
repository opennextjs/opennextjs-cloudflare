import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PACKAGE_NAME = "@opennextjs/cloudflare";

export type Config = {
  build: {
    // Whether to skip building the Next.js app or not
    skipNextBuild: boolean;
    // Whether minification should be enabled or not
    shouldMinify: boolean;
  };

  paths: {
    source: {
      // Path to the next application
      root: string;
      // Path to the app's `.next` directory (where `next build` saves the build output)
      dotNext: string;
      // Path to the application standalone root directory
      standaloneRoot: string;
    };
    output: {
      // Path to the output directory
      root: string;
      // Path to the OpenNext static assets directory
      assets: string;
      // Path to the app's `.next` directory in the OpenNext output directory
      dotNext: string;
      // Path to the application standalone root directory
      standaloneRoot: string;
      // Path to the application standalone directory (where `next build` saves the standalone app)
      standaloneApp: string;
      // Path to the `.next` directory specific to the standalone application
      standaloneAppDotNext: string;
      // Path to the `server` directory specific to the standalone application
      standaloneAppServer: string;
    };
    internal: {
      // Package in the standalone node_modules
      package: string;
      // Templates in the package in the standalone node_modules
      templates: string;
    };
  };

  // Internal name for the copy of the package
  internalPackageName: string;
};

/**
 * Computes the configuration.
 *
 * @param projectOpts The options for the project
 * @returns The configuration, see `Config`
 */
export function getConfig(projectOpts: ProjectOptions): Config {
  const sourceDirDotNext = join(projectOpts.sourceDir, ".next");

  const dotNext = join(projectOpts.outputDir, ".next");
  const appPath = getNextjsApplicationPath(dotNext).replace(/\/$/, "");
  const standaloneRoot = join(dotNext, "standalone");
  const standaloneApp = join(standaloneRoot, appPath);
  const standaloneAppDotNext = join(standaloneApp, ".next");
  const standaloneAppServer = join(standaloneAppDotNext, "server");

  const nodeModules = join(standaloneApp, "node_modules");
  const internalPackage = join(nodeModules, ...PACKAGE_NAME.split("/"));
  const internalTemplates = join(internalPackage, "cli", "templates");

  return {
    build: {
      skipNextBuild: projectOpts.skipNextBuild,
      shouldMinify: projectOpts.minify,
    },

    paths: {
      source: {
        root: projectOpts.sourceDir,
        dotNext: sourceDirDotNext,
        standaloneRoot: join(sourceDirDotNext, "standalone"),
      },
      output: {
        root: projectOpts.outputDir,
        assets: join(projectOpts.outputDir, "assets"),
        dotNext,
        standaloneRoot,
        standaloneApp,
        standaloneAppDotNext,
        standaloneAppServer,
      },
      internal: {
        package: internalPackage,
        templates: internalTemplates,
      },
    },

    internalPackageName: PACKAGE_NAME,
  };
}

export function containsDotNextDir(folder: string): boolean {
  try {
    return statSync(join(folder, ".next")).isDirectory();
  } catch {
    return false;
  }
}

export type ProjectOptions = {
  // Next app root folder
  sourceDir: string;
  // The directory to save the output to (defaults to the app's directory)
  outputDir: string;
  // Whether the Next.js build should be skipped (i.e. if the `.next` dir is already built)
  skipNextBuild: boolean;
  // Whether the check to see if a wrangler config file exists should be skipped
  skipWranglerConfigCheck: boolean;
  // Whether minification of the worker should be enabled
  minify: boolean;
};

/**
 * It basically tries to find the path that the application is under inside the `.next/standalone` directory, using the `.next/server` directory
 * presence as the condition that needs to be met.
 *
 * For example:
 *  When I build the api application the `.next/server` directory is located in:
 *  `<dotNextDir>/standalone/next-apps/api/.next/server`
 *  and the function here given the `dotNextDir` returns `next-apps/api`
 */
function getNextjsApplicationPath(dotNextDir: string): string {
  const serverPath = findServerParentPath(dotNextDir);

  if (!serverPath) {
    throw new Error(`Unexpected Error: no \`.next/server\` folder could be found in \`${serverPath}\``);
  }

  return relative(join(dotNextDir, "standalone"), serverPath);
}

function findServerParentPath(parentPath: string): string | undefined {
  try {
    if (statSync(join(parentPath, ".next", "server")).isDirectory()) {
      return parentPath;
    }
  } catch {
    /* empty */
  }

  const folders = readdirSync(parentPath);

  for (const folder of folders) {
    const subFolder = join(parentPath, folder);
    if (statSync(join(parentPath, folder)).isDirectory()) {
      const dirServerPath = findServerParentPath(subFolder);
      if (dirServerPath) {
        return dirServerPath;
      }
    }
  }
}
