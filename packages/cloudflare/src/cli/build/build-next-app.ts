import { type AgentName as PackageManager, detect } from "package-manager-detector";
import { execSync } from "node:child_process";

/**
 * Builds the Next.js app in the standard Next.js cli way (this outputs a `.next` directory)
 *
 * Note: this function simply builds the `.next` directory it does not perform any extra building operation
 *
 * @param nextAppDir the directory of the app to build
 */
export async function buildNextjsApp(nextAppDir: string): Promise<void> {
  const pm = await detect();

  if (!pm) {
    throw new Error("Fatal Error: package manager detection failed, aborting");
  }

  runNextBuildCommand(pm.name, nextAppDir);
}

// equivalent to: https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build.ts#L175-L186
function runNextBuildCommand(packager: PackageManager, nextAppDir: string) {
  const command = `${packager === "npm" ? "npx" : packager} next build`;
  execSync(command, {
    stdio: "inherit",
    cwd: nextAppDir,
    env: {
      ...process.env,
      // equivalent to: https://github.com/sst/open-next/blob/f61b0e9/packages/open-next/src/build.ts#L168-L173
      // Equivalent to setting `output: "standalone"` in next.config.js
      NEXT_PRIVATE_STANDALONE: "true",
    },
  });
}
