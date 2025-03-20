import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import { populateCache } from "../populate-cache/populate-cache.js";
import { runWrangler } from "../utils/run-wrangler.js";

export async function preview(
  options: BuildOptions,
  config: OpenNextConfig,
  previewOptions: { passthroughArgs: string[] }
) {
  await populateCache(options, config, { target: "local" });
  runWrangler(options, ["dev", ...previewOptions.passthroughArgs], { logging: "all" });
}
