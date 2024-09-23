import { readdirSync, statSync } from "node:fs";
import path, { relative } from "node:path";

/**
 * This type includes all the paths necessary to deal with a Next.js application build
 *
 * NOTE: WIP, we still need to discern which paths are relevant here!
 */
export type NextjsAppPaths = {
  appDir: string;
  /**
   * The path to the application's `.next` directory (where `next build` saves the build output)
   */
  dotNextDir: string;

  /**
   * The path to the application standalone directory (where `next build` saves the standalone app when standalone mode is used)
   */
  standaloneAppDir: string;

  /**
   * the path to the `.next` directory specific to the standalone application
   */
  standaloneAppDotNextDir: string;

  /**
   * the path to the `server` directory specific to the standalone application
   */
  standaloneAppServerDir: string;
};

/**
 * Collects all the paths necessary for dealing with the Next.js applications output
 *
 * @param nextAppDir The path to the Next.js app
 * @returns the various paths.
 */
export function getNextjsAppPaths(nextAppDir: string): NextjsAppPaths {
  const dotNextDir = getDotNextDirPath(nextAppDir);

  const appPath = getNextjsApplicationPath(dotNextDir).replace(/\/$/, "");

  const standaloneAppDir = path.join(dotNextDir, "standalone", appPath);

  return {
    appDir: nextAppDir,
    dotNextDir,
    standaloneAppDir,
    standaloneAppDotNextDir: path.join(standaloneAppDir, ".next"),
    standaloneAppServerDir: path.join(standaloneAppDir, ".next", "server"),
  };
}

function getDotNextDirPath(nextAppDir: string): string {
  const dotNextDirPath = `${nextAppDir}/.next`;

  try {
    const dirStats = statSync(dotNextDirPath);
    if (!dirStats.isDirectory()) throw new Error();
  } catch {
    throw new Error(`Error: \`.next\` directory not found!`);
  }

  return dotNextDirPath;
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

  return relative(`${dotNextDir}/standalone`, serverPath);

  function findServerParentPath(path: string): string | undefined {
    try {
      if (statSync(`${path}/.next/server`).isDirectory()) {
        return path;
      }
    } catch {}

    const files = readdirSync(path);

    for (const file of files) {
      if (statSync(`${path}/${file}`).isDirectory()) {
        const dirServerPath = findServerParentPath(`${path}/${file}`);
        if (dirServerPath) {
          return dirServerPath;
        }
      }
    }
  }
}
