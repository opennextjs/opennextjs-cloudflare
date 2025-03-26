import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import { getWranglerEnvironmentFlag, runWrangler } from "../utils/run-wrangler.js";
import { populateCache } from "./populate-cache.js";

export async function preview(
  options: BuildOptions,
  config: OpenNextConfig,
  previewOptions: { passthroughArgs: string[] }
) {
  await populateCache(options, config, {
    target: "local",
    environment: getWranglerEnvironmentFlag(previewOptions.passthroughArgs),
  });

  runWrangler(options, ["dev", ...previewOptions.passthroughArgs], { logging: "all" });
}
