import { NextjsAppPaths } from "../../nextjsPaths";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

/**
 * Using the Next.js build output in the `.next` directory builds a workerd compatible output
 *
 * @param outputDir the directory where to save the output
 * @param nextjsAppPaths
 */
export async function buildWorker(
  outputDir: string,
  nextjsAppPaths: NextjsAppPaths
): Promise<void> {
  const workerEntrypoint = `${import.meta.dirname}/templates/worker.ts`;

  const workerOutputFile = `${outputDir}/index.mjs`;

  const nextConfigStr =
    readFileSync(nextjsAppPaths.standaloneAppDir + "/server.js", "utf8")?.match(
      /const nextConfig = ({.+?})\n/
    )?.[1] ?? {};

  build({
    entryPoints: [workerEntrypoint],
    bundle: true,
    outfile: workerOutputFile,
    format: "esm",
    target: "esnext",
    minify: false,
    define: {
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG":
        JSON.stringify(nextConfigStr),
      // Ask mhart if he can explain why the `define`s below are necessary
      "process.env.NEXT_RUNTIME": '"nodejs"',
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_MINIMAL": "true",
      // "process.env.NEXT_PRIVATE_MINIMAL_MODE": "true",
      // __non_webpack_require__: "require",
    },
    // We need to set platform to node so that esbuild doesn't complain about the node imports
    platform: "node",
  });

  console.log();
  console.log(`\x1b[35mWorker saved in \`${workerOutputFile}\` 🚀\x1b[0m`);
  console.log();
}
