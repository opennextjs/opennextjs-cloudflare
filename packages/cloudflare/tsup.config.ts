import { cp } from "fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cache-handler.ts"],
  outDir: "dist",
  dts: false,
  format: ["esm"],
  platform: "node",
  external: ["esbuild"],
  onSuccess: async () => {
    await cp(`${__dirname}/src/templates`, `${__dirname}/dist/templates`, {
      recursive: true,
    });
  },
});
