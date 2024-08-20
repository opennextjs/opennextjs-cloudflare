import { cp } from "fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  dts: true,
  format: ["cjs"],
  platform: "node",
  external: ["esbuild"],
  onSuccess: async () => {
    await cp(
      `${import.meta.dirname}/src/build/build-worker/templates`,
      `${import.meta.dirname}/dist/templates`,
      { recursive: true }
    );
  },
});
