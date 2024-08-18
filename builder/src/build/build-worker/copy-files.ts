import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  copyFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, dirname, resolve } from "path";

/**
 * Simplified version of the `copyTracedFiles` function: https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build/copyTracedFiles.ts
 *
 * It copies all the necessary files in the output directory.
 */
export function copyRelevantFiles(
  outputDir: string,
  packagePath: string,
  dotNextDir: string,
  routes: string[]
) {
  const standaloneDir = `${dotNextDir}/standalone`;
  const standaloneDotNextDir = `${standaloneDir}/${packagePath}/.next`;
  const outputNextDir = `${outputDir}/${packagePath}/.next`;

  const extractFiles = (files: string[], from = standaloneDir) => {
    return files.map((f) => resolve(from, f));
  };

  if (existsSync(join(standaloneDir, ".next/server/pages"))) {
    mkdirSync(join(outputNextDir, "server/pages"), {
      recursive: true,
    });
  }
  if (existsSync(join(standaloneDir, ".next/server/app"))) {
    mkdirSync(join(outputNextDir, "server/app"), {
      recursive: true,
    });
  }
  mkdirSync(join(outputNextDir, "server/chunks"), {
    recursive: true,
  });

  const filesToCopy = new Map<string, string>();

  const computeCopyFilesForPage = (pagePath: string) => {
    const fullFilePath = `server/${pagePath}.js`;
    let requiredFiles;
    try {
      requiredFiles = JSON.parse(
        readFileSync(`${standaloneDotNextDir}/${fullFilePath}.nft.json`, "utf8")
      );
    } catch (e) {
      throw new Error("Edge Runtime not supported [TODO]");
    }
    const dir = dirname(fullFilePath);
    extractFiles(
      requiredFiles.files,
      `${standaloneDir}/${packagePath}/.next/${dir}`
    ).forEach((f) => {
      filesToCopy.set(f, f.replace(standaloneDir, outputDir));
    });

    if (!existsSync(`${standaloneDir}/${packagePath}/.next/${fullFilePath}`)) {
      debugger;
      throw new Error(
        `This error should only happen for static 404 and 500 page from page router. Report this if that's not the case.,
          File ${fullFilePath} does not exist`
      );
    }

    filesToCopy.set(
      `${standaloneDir}/${packagePath}/.next/${fullFilePath}`,
      `${outputNextDir}/${fullFilePath}`
    );
  };

  const safeComputeCopyFilesForPage = (
    pagePath: string,
    alternativePath?: string
  ) => {
    try {
      computeCopyFilesForPage(pagePath);
    } catch (e) {
      if (alternativePath) {
        computeCopyFilesForPage(alternativePath);
      }
    }
  };

  const hasPageDir = routes.some((route) => route.startsWith("pages/"));
  const hasAppDir = routes.some((route) => route.startsWith("app/"));

  // We need to copy all the base files like _app, _document, _error, etc
  // One thing to note, is that next try to load every routes that might be needed in advance
  // So if you have a [slug].tsx at the root, this route will always be loaded for 1st level request
  // along with _app and _document
  if (hasPageDir) {
    //Page dir
    computeCopyFilesForPage("pages/_app");
    computeCopyFilesForPage("pages/_document");
    computeCopyFilesForPage("pages/_error");

    // These files can be present or not depending on if the user uses getStaticProps
    safeComputeCopyFilesForPage("pages/404");
    safeComputeCopyFilesForPage("pages/500");
  }

  if (hasAppDir) {
    //App dir
    // In next 14.2.0, _not-found is at 'app/_not-found/page'
    safeComputeCopyFilesForPage("app/_not-found", "app/_not-found/page");
  }

  //Actually copy the files
  filesToCopy.forEach((to, from) => {
    if (
      //TODO: we need to figure which packages we could safely remove
      from.includes("node_modules/caniuse-lite") ||
      // from.includes("jest-worker") || This ones seems necessary for next 12
      from.includes("node_modules/sharp")
    ) {
      return;
    }
    mkdirSync(dirname(to), { recursive: true });
    let symlink = null;
    // For pnpm symlink we need to do that
    // see https://github.com/vercel/next.js/blob/498f342b3552d6fc6f1566a1cc5acea324ce0dec/packages/next/src/build/utils.ts#L1932
    try {
      symlink = readlinkSync(from);
    } catch (e) {
      //Ignore
    }
    if (symlink) {
      try {
        symlinkSync(symlink, to);
      } catch (e: any) {
        if (e.code !== "EEXIST") {
          throw e;
        }
      }
    } else {
      copyFileSync(from, to);
    }
  });

  readdirSync(standaloneDotNextDir).forEach((f) => {
    if (statSync(join(standaloneDotNextDir, f)).isDirectory()) return;
    copyFileSync(join(standaloneDotNextDir, f), join(outputNextDir, f));
  });

  // We then need to copy all the files at the root of server

  mkdirSync(join(outputNextDir, "server"), { recursive: true });

  readdirSync(join(standaloneDotNextDir, "server")).forEach((f) => {
    if (statSync(join(standaloneDotNextDir, "server", f)).isDirectory()) return;
    if (f !== "server.js") {
      copyFileSync(
        join(standaloneDotNextDir, "server", f),
        join(join(outputNextDir, "server"), f)
      );
    }
  });

  // TODO: Recompute all the files.
  // vercel doesn't seem to do it, but it seems wasteful to have all those files
  // we replace the pages-manifest.json with an empty one if we don't have a pages dir so that
  // next doesn't try to load _app, _document
  if (!hasPageDir) {
    writeFileSync(join(outputNextDir, "server/pages-manifest.json"), "{}");
  }

  //TODO: Find what else we need to copy
  const copyStaticFile = (filePath: string) => {
    if (existsSync(join(standaloneDotNextDir, filePath))) {
      mkdirSync(dirname(join(outputNextDir, filePath)), {
        recursive: true,
      });
      copyFileSync(
        join(standaloneDotNextDir, filePath),
        join(outputNextDir, filePath)
      );
    }
  };
  // Get all the static files - Should be only for pages dir
  // Ideally we would filter only those that might get accessed in this specific functions
  // Maybe even move this to s3 directly
  if (hasPageDir) {
    // First we get truly static files - i.e. pages without getStaticProps
    const staticFiles: Array<string> = Object.values(
      JSON.parse(
        readFileSync(
          join(standaloneDotNextDir, "server/pages-manifest.json"),
          "utf8"
        )
      )
    );
    // Then we need to get all fallback: true dynamic routes html
    const prerenderManifest = JSON.parse(
      readFileSync(
        join(standaloneDotNextDir, "prerender-manifest.json"),
        "utf8"
      )
    );
    const config = JSON.parse(
      readFileSync(
        join(standaloneDotNextDir, "required-server-files.json"),
        "utf8"
      )
    ).config;
    const locales = config.i18n?.locales as undefined | string[];
    Object.values(prerenderManifest.dynamicRoutes).forEach((route: any) => {
      if (typeof route.fallback === "string") {
        if (locales) {
          locales.forEach((locale) => {
            staticFiles.push(`pages/${locale}${route.fallback}`);
          });
        } else {
          staticFiles.push(`pages${route.fallback}`);
        }
      }
    });

    staticFiles.forEach((f: string) => {
      if (f.endsWith(".html")) {
        copyStaticFile(`server/${f}`);
      }
    });
  }
}
