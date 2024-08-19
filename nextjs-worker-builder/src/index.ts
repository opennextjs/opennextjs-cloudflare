import { resolve } from "node:path";
import { getArgs } from "./args";
import { existsSync } from "node:fs";
import { build } from "./build";

// const { skipBuild, outputDir } = await getArgs();

const inputNextAppDir = resolve(".");

if (
  !["js", "cjs", "mjs", "ts"].some((ext) => existsSync(`./next.config.${ext}`))
) {
  // TODO: we can add more validation later
  throw new Error("Error: Not in a Next.js app project");
}

getArgs().then(({ skipBuild, outputDir }) => {
  build(inputNextAppDir, {
    outputDir,
    skipBuild: !!skipBuild,
  });
});
