import { spawnSync } from "node:child_process";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

export type WranglerTarget = "local" | "remote";

type WranglerOptions = {
  target?: WranglerTarget;
  environment?: string;
  excludeRemoteFlag?: boolean;
  logging?: "all" | "error";
};

export function runWrangler(options: BuildOptions, args: string[], wranglerOpts: WranglerOptions = {}) {
  const result = spawnSync(
    options.packager,
    [
      options.packager === "bun" ? "x" : "exec",
      "wrangler",
      ...args,
      wranglerOpts.environment && `--env ${wranglerOpts.environment}`,
      wranglerOpts.target === "remote" && !wranglerOpts.excludeRemoteFlag && "--remote",
      wranglerOpts.target === "local" && "--local",
    ].filter((v): v is string => !!v),
    {
      shell: true,
      stdio: wranglerOpts.logging === "error" ? ["ignore", "ignore", "inherit"] : "inherit",
    }
  );

  if (result.status !== 0) {
    logger.error("Wrangler command failed");
    process.exit(1);
  }
}

export function isWranglerTarget(v: string | undefined): v is WranglerTarget {
  return !!v && ["local", "remote"].includes(v);
}

/**
 * Find the value of the environment flag (`--env` / `-e`) used by Wrangler.
 *
 * @param args - CLI arguments.
 * @returns Value of the environment flag.
 */
export function getWranglerEnvironmentFlag(args: string[]) {
  for (let i = 0; i <= args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--env" || arg === "-e") {
      return args[i + 1];
    }

    if (arg.startsWith("--env=") || arg.startsWith("-e=")) {
      return arg.split("=")[1];
    }
  }
}
