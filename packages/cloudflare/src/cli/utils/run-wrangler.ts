import { spawnSync } from "node:child_process";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";

export type WranglerTarget = "local" | "remote";

export function runWrangler(
  options: BuildOptions,
  args: string[],
  wranglerOpts: { target?: WranglerTarget; excludeRemoteFlag?: boolean; logging?: "all" | "error" } = {}
) {
  const result = spawnSync(
    options.packager,
    [
      "exec",
      "wrangler",
      ...args,
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
