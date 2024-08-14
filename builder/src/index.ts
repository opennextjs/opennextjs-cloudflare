import { getArgs } from "./args";
import { build } from "./build";

const { inputNextAppDir, skipBuild, outputDir } = await getArgs();

await build(inputNextAppDir, {
  outputDir,
  skipBuild: !!skipBuild,
});
