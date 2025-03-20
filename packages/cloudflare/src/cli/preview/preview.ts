import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

import { populateCache } from "../populate-cache/populate-cache";
import { runWrangler } from "../utils/run-wrangler";

export async function preview(options: BuildOptions, config: OpenNextConfig) {
  await populateCache(options, config, { target: "local" });
  runWrangler(options, ["dev"], { logging: "all" });
}
