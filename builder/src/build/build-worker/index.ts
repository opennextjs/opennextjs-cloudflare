import { relative, resolve } from "node:path";
import { cwd } from "node:process";
import { NextjsAppPaths } from "../../nextjsPaths";
import { build } from "esbuild";

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

  build({
    entryPoints: [workerEntrypoint],
    bundle: true,
    outfile: workerOutputFile,
    format: "esm",
    target: "esnext",
    minify: false,
  });

  console.log();
  console.log(`\x1b[35mWorker saved in \`${workerOutputFile}\` 🚀\x1b[0m`);
  console.log();
}
