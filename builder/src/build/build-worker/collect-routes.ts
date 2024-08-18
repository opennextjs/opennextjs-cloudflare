import { existsSync } from "fs";
import { traverseFiles } from "../../utils";

/**
 * Collects the application routes from the `.next` directory
 *
 * The routes collection logic is taken from: https://github.com/sst/open-next/blob/f61b0e948/packages/open-next/src/build/createServerBundle.ts#L33-L124
 * (more specifically https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build/createServerBundle.ts#L71-L115)
 *
 * IMPORTANT: we're for now ignoring edge function routes (which I presume, in open-next are being built in https://github.com/sst/open-next/blob/f61b0e948/packages/open-next/src/build/createServerBundle.ts#L37-L63)
 *            one step at a time, let's just do the node.js stuff for now
 *
 */
export function collectApplicationRoutes(
  dotNextDir: string,
  packagePath: string
): string[] {
  const routes = new Set<string>();

  const serverPath = `${dotNextDir}/standalone/${packagePath}/.next/server`;

  // Find app dir routes
  if (existsSync(`${serverPath}/app`)) {
    const appPath = `${serverPath}/app`;
    traverseFiles(appPath, (file) => {
      if (file.endsWith("page.js") || file.endsWith("route.js")) {
        const route = `app/${file.replace(/(^\/)|(\.js$)/, "")}`;
        routes.add(route);
      }
    });
  }

  // Find pages dir routes
  if (existsSync(`${serverPath}/pages`)) {
    const pagePath = `${serverPath}/pages`;
    traverseFiles(pagePath, (file) => {
      if (file.endsWith(".js")) {
        const route = `pages/${file.replace(/(^\/)|(\.js$)/, "")}`;
        routes.add(route);
      }
    });
  }

  return [...routes.values()];
}
