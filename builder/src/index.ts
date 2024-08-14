import { getArgs } from "./args";
import { buildWorkerApp } from "./build";

const { inputNextAppDir, outputDir } = await getArgs();

buildWorkerApp(inputNextAppDir, outputDir);
