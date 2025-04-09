import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import { getWranglerEnvironmentFlag, runWrangler } from "../utils/run-wrangler.js";
import { populateCache } from "./populate-cache.js";

export async function upload(
  options: BuildOptions,
  config: OpenNextConfig,
  uploadOptions: { passthroughArgs: string[] }
) {
  await populateCache(options, config, {
    target: "remote",
    environment: getWranglerEnvironmentFlag(uploadOptions.passthroughArgs),
  });

  runWrangler(options, ["versions upload", ...uploadOptions.passthroughArgs], { logging: "all" });
}
