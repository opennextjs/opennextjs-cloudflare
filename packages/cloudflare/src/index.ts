#!/usr/bin/env node
import { resolve } from "node:path";
import { getArgs } from "./args";
import { existsSync } from "node:fs";
import { build } from "./build/build";

const nextAppDir = resolve(".");

console.log(`Building the Next.js app in the current folder (${nextAppDir})`);

if (!["js", "cjs", "mjs", "ts"].some((ext) => existsSync(`./next.config.${ext}`))) {
  // TODO: we can add more validation later
  throw new Error("Error: Not in a Next.js app project");
}

const { skipBuild, outputDir } = getArgs();

await build(nextAppDir, {
  outputDir,
  skipBuild: !!skipBuild,
});
