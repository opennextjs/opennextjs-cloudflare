import { relative } from "node:path";
import { buildNextjsApp } from "./build-next-app";
import { cwd } from "node:process";

/**
 * Builds the application in a format that can be passed to workerd
 *
 * It saves the output in a `.worker-next` directory
 *
 * @param inputNextAppDir the directory of the Next.js app to build
 * @param outputDir the directory where to save the output (defaults to the app's directory)
 */
export function buildWorkerApp(
  inputNextAppDir: string,
  outputDir?: string
): void {
  if (!outputDir) {
    outputDir = inputNextAppDir;
  }
  outputDir = `${outputDir}/.worker-next`;

  buildNextjsApp(inputNextAppDir);

  console.log(`Saving output in \`${relative(cwd(), outputDir)}\``);
  // copy things into the `outputDir` etc...
}
