#!/usr/bin/env node
import { resolve } from "node:path";

import { getArgs } from "./args.js";
import { build } from "./build/index.js";

const nextAppDir = process.cwd();

const { skipNextBuild, outputDir, minify } = getArgs();

await build({
  sourceDir: nextAppDir,
  outputDir: resolve(outputDir ?? nextAppDir, ".open-next"),
  skipNextBuild,
  minify,
});
