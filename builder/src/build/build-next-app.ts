import { execSync } from "node:child_process";

/**
 * Builds the Next.js app in the standard Next.js cli way (this outputs a `.next` directory)
 *
 * Note: this function simply builds the `.next` directory it does not perform any extra building operation
 *
 * @param nextAppDir the directory of the app to build
 */
export function buildNextjsApp(nextAppDir: string): void {
  runNextBuildCommand("pnpm", nextAppDir);
}

// equivalent to: https://github.com/sst/open-next/blob/f61b0e94/packages/open-next/src/build.ts#L175-L186
function runNextBuildCommand(
  // let's keep things simple and just support only pnpm for now
  packager: "pnpm" /*"npm" | "yarn" | "pnpm" | "bun"*/,
  nextAppDir: string
) {
  const command = ["bun", "npm"].includes(packager) ? `${packager} next build` : `${packager} next build`;
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
