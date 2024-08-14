import { existsSync, readdirSync, statSync } from "node:fs";
import { relative } from "node:path";
import { cwd } from "node:process";
import { traverseFiles } from "../utils";

/**
 * Using the Next.js build output in the `.next` directory builds a workerd compatible output
 *
 * @param dotNextDir the `.next` directory where the Next.js app has been built
 * @param outputDir the directory where to save the output
 */
export async function buildWorker(
  dotNextDir: string,
  outputDir: string
): Promise<void> {
  console.log(`Saving output in \`${relative(cwd(), outputDir)}\``);
  // copy things into the `outputDir` etc...
  const routes = collectApplicationRoutes(dotNextDir);

  console.log(`\x1b[31m === routes === \x1b[0m`, {
    routes,
  });
}

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
function collectApplicationRoutes(dotNextDir: string): Set<string> {
  const routes = new Set<string>();

  const serverPath = findStandaloneServerPath(dotNextDir);

  if (!serverPath) {
    throw new Error(
      `Unexpected Error: no \`.next/server\` folder could be found in \`${serverPath}\``
    );
  }

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

  return routes;
}

/**
 * Given a path returns the first directory in it (at any nesting level) that contains a `.next/server` directory
 * (which is a directory in the Next.js standalone folder that we need to read from)
 *
 * @param path The path from where to start the search
 * @returns the returned server path or `undefined` if none was found
 */
function findStandaloneServerPath(path: string): string | undefined {
  try {
    const serverPath = `${path}/.next/server`;
    if (statSync(serverPath).isDirectory()) {
      return serverPath;
    }
  } catch {}

  const files = readdirSync(path);

  for (const file of files) {
    if (statSync(`${path}/${file}`).isDirectory()) {
      const dirServerPath = findStandaloneServerPath(`${path}/${file}`);
      if (dirServerPath) {
        return dirServerPath;
      }
    }
  }
}
