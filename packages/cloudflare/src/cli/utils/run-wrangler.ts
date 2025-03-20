import { spawnSync } from "node:child_process";

import logger from "@opennextjs/aws/logger.js";

export type WranglerTarget = "local" | "remote";

export function runWrangler(
  pm: string,
  wranglerOpts: { target: WranglerTarget; excludeRemoteFlag?: boolean },
  args: string[]
) {
  const result = spawnSync(
    pm,
    [
      "exec",
      "wrangler",
      ...args,
      wranglerOpts.target === "remote" && !wranglerOpts.excludeRemoteFlag && "--remote",
      wranglerOpts.target === "local" && "--local",
    ].filter((v): v is string => !!v),
    {
      shell: true,
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  if (result.status !== 0) {
    logger.error("Failed to populate cache");
    process.exit(1);
  }
}

export function isWranglerTarget(v: string | undefined): v is WranglerTarget {
  return !!v && ["local", "remote"].includes(v);
}
