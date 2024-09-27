import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";

const cliConfig = defineConfig({
  entry: ["src/cli/index.ts", "src/cli/cache-handler.ts"],
  outDir: "dist/cli",
  dts: false,
  format: ["esm"],
  platform: "node",
  external: ["esbuild"],
  clean: true,
  onSuccess: async () => {
    await cp(`${__dirname}/src/cli/templates`, `${__dirname}/dist/cli/templates`, {
      recursive: true,
    });
  },
});

const apiConfig = defineConfig({
  entry: ["src/api"],
  outDir: "dist/api",
  dts: true,
  format: ["esm"],
  platform: "node",
  external: ["server-only"],
  clean: true,
});

export default [cliConfig, apiConfig];
