import nodeFsPromises from "node:fs/promises";
import nodeFs from "node:fs";
import nodePath from "node:path";
import nodeChildProcess from "node:child_process";
import nodeUtil from "node:util";

const promiseExec = nodeUtil.promisify(nodeChildProcess.exec);

await ensureWranglerSetup();

/**
 * Collects name and absolute paths of apps (in this repository) that we want to benchmark
 *
 * @returns Array of objects containing the app's name and absolute path
 */
export async function collectAppPathsToBenchmark(): Promise<
  {
    name: string;
    path: string;
  }[]
> {
  const allExampleNames = await nodeFsPromises.readdir("../examples");

  /**
   * Example applications that we don't want to benchmark
   *
   * Currently we only want to skip the `vercel-commerce` example, and that's simply
   * because it requires a shopify specific setup and secrets.
   */
  const exampleAppsNotToBenchmark = new Set(["vercel-commerce"]);

  const examplePaths = allExampleNames
    .filter((exampleName) => !exampleAppsNotToBenchmark.has(exampleName))
    .map((exampleName) => ({
      name: exampleName,
      path: nodePath.resolve(`../examples/${exampleName}`),
    }));

  return examplePaths;
}

/**
 * Builds an application using their "build:worker" script
 * (an error is thrown if the application doesn't have such a script)
 *
 * @param dir Path to the application to build
 */
export async function buildApp(dir: string): Promise<void> {
  const packageJsonPath = `${dir}/package.json`;
  if (!nodeFs.existsSync(packageJsonPath)) {
    throw new Error(`Error: package.json for app at "${dir}" not found`);
  }

  const packageJsonContent = JSON.parse(await nodeFsPromises.readFile(packageJsonPath, "utf8"));

  const buildScript = "build:worker";

  if (!packageJsonContent.scripts?.[buildScript]) {
    throw new Error(`Error: package.json for app at "${dir}" does not include a "${buildScript}" script`);
  }

  const command = `pnpm ${buildScript}`;

  await promiseExec(command, { cwd: dir });
}

/**
 * Deploys a built application using wrangler
 *
 * @param dir Path to the application to build
 * @returns the url of the deployed application
 */
export async function deployBuiltApp(dir: string): Promise<string> {
  const { stdout } = await promiseExec("pnpm exec wrangler deploy", { cwd: dir });

  const deploymentUrl = stdout.match(/\bhttps:\/\/(?:[a-zA-Z0-9.\-])*\.workers\.dev\b/)?.[0];

  if (!deploymentUrl) {
    throw new Error(`Could not obtain a deployment url for app at "${dir}"`);
  }

  return deploymentUrl;
}

/**
 * Makes sure that everything is set up so that wrangler can actually deploy the applications.
 * This means that:
 *  - the user has logged in
 *  - if they have more than one account they have set a CLOUDFLARE_ACCOUNT_ID env variable
 */
async function ensureWranglerSetup(): Promise<void> {
  const { stdout } = await promiseExec("pnpm dlx wrangler whoami");

  if (stdout.includes("You are not authenticated")) {
    throw new Error("Please log in using wrangler by running `pnpm dlx wrangler login`");
  }

  if (!(process.env as Record<string, unknown>)["CLOUDFLARE_ACCOUNT_ID"]) {
    throw new Error(
      "Please set the CLOUDFLARE_ACCOUNT_ID environment variable to the id of the account you want to use to deploy the applications"
    );
  }
}
