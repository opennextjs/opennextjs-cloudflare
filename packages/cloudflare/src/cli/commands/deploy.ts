import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import { getWranglerEnvironmentFlag, runWrangler } from "../utils/run-wrangler.js";
import { populateCache } from "./populate-cache.js";

export async function deploy(
  options: BuildOptions,
  config: OpenNextConfig,
  deployOptions: { passthroughArgs: string[] }
) {
  await populateCache(options, config, {
    target: "remote",
    environment: getWranglerEnvironmentFlag(deployOptions.passthroughArgs),
  });

  runWrangler(options, ["deploy", ...deployOptions.passthroughArgs], { logging: "all" });
}
