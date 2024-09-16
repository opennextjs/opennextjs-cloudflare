import { cp } from "fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  dts: true,
  format: ["esm"],
  platform: "node",
  external: ["esbuild"],
  onSuccess: async () => {
    await cp(`${__dirname}/src/build/build-worker/templates`, `${__dirname}/dist/templates`, {
      recursive: true,
    });
  },
});
