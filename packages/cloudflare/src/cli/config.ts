import path, { relative } from "node:path";
import { readdirSync, statSync } from "node:fs";

const PACKAGE_NAME = "@opennextjs/cloudflare";

// Make this user configurable
const UserConfig = {
  cache: {
    bindingName: "NEXT_CACHE_WORKERS_KV",
  },
};

export type Config = {
  paths: {
    // Path to the next application
    nextApp: string;
    // Path to the output folder
    builderOutput: string;
    // Path to the app's `.next` directory (where `next build` saves the build output)
    dotNext: string;
    // Path to the application standalone directory (where `next build` saves the standalone app)
    standaloneApp: string;
    // Path to the `.next` directory specific to the standalone application
    standaloneAppDotNext: string;
    // Path to the `server` directory specific to the standalone application
    standaloneAppServer: string;
    // Package in the standalone node_modules
    internalPackage: string;
  };

  cache: {
    kvBindingName: string;
  };

  // Internal name for the copy of the package
  internalPackageName: string;
};

/**
 * Computes the configuration.
 *
 * @param appDir Next app root folder
 * @param outputDir Output of the cloudflare builder
 *
 * @returns the configuration, see `Config`
 */
export function getConfig(appDir: string, outputDir: string): Config {
  const dotNext = path.join(outputDir, ".next");
  const appPath = getNextjsApplicationPath(dotNext).replace(/\/$/, "");
  const standaloneApp = path.join(dotNext, "standalone", appPath);
  const standaloneAppDotNext = path.join(standaloneApp, ".next");
  const standaloneAppServer = path.join(standaloneAppDotNext, "server");

  const nodeModules = path.join(standaloneApp, "node_modules");
  const internalPackage = path.join(nodeModules, ...PACKAGE_NAME.split("/"));

  return {
    paths: {
      nextApp: appDir,
      builderOutput: outputDir,
      dotNext,
      standaloneApp,
      standaloneAppDotNext,
      standaloneAppServer,
      internalPackage,
    },

    cache: {
      kvBindingName: UserConfig.cache.bindingName,
    },

    internalPackageName: PACKAGE_NAME,
  };
}

export function containsDotNextDir(folder: string): boolean {
  try {
    return statSync(path.join(folder, ".next")).isDirectory();
  } catch {
    return false;
  }
}

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

  return relative(path.join(dotNextDir, "standalone"), serverPath);
}

function findServerParentPath(parentPath: string): string | undefined {
  try {
    if (statSync(path.join(parentPath, ".next", "server")).isDirectory()) {
      return parentPath;
    }
  } catch {
    /* empty */
  }

  const folders = readdirSync(parentPath);

  for (const folder of folders) {
    const subFolder = path.join(parentPath, folder);
    if (statSync(path.join(parentPath, folder)).isDirectory()) {
      const dirServerPath = findServerParentPath(subFolder);
      if (dirServerPath) {
        return dirServerPath;
      }
    }
  }
}
