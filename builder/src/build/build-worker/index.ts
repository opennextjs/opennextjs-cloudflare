import { readdirSync, statSync } from "node:fs";
import { relative } from "node:path";
import { cwd } from "node:process";
import { copyRelevantFiles } from "./copy-files";
import { collectApplicationRoutes } from "./collect-routes";
import { runBuild } from "./build";

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

  const packagePath = findPackagePath(dotNextDir);

  // copy things into the `outputDir` etc...
  const routes = collectApplicationRoutes(dotNextDir, packagePath);

  console.log(`\x1b[31m === routes === \x1b[0m`, {
    routes,
  });

  copyRelevantFiles(outputDir, packagePath, dotNextDir, routes);

  await runBuild(outputDir, packagePath);
}

/**
 * Alternative implementation for https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build/createServerBundle.ts#L69C3-L69C71
 *
 * It basically tries to find the path that the application is under inside the `.next/standalone` directory, using the `.next/server` directory
 * presence as the condition that needs to be met.
 *
 * For example:
 *  When I build my application the `.next/server` directory is located in:
 *  `<dotNextDir>/standalone/next-apps/api-nodejs-hello-world/.next/server`
 *  and the function here given the `dotNextDir` needs to return `next-apps/api-nodejs-hello-world`
 */
function findPackagePath(dotNextDir: string): string {
  const findServerParentPath = (path: string): string | undefined => {
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
  };

  const serverPath = findServerParentPath(dotNextDir);

  if (!serverPath) {
    throw new Error(
      `Unexpected Error: no \`.next/server\` folder could be found in \`${serverPath}\``
    );
  }

  return relative(`${dotNextDir}/standalone`, serverPath);
}
