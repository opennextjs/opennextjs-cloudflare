import { readdirSync } from "fs";
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
    await cp(
      `${import.meta.dirname}/src/build/build-worker/templates`,
      `${import.meta.dirname}/dist/templates`,
      { recursive: true }
    );
    // const aaa = readdirSync(
    //   `${import.meta.dirname}/src/build/build-worker/templates`
    // );
    // const bbb = readdirSync(`${import.meta.dirname}/dist`);

    // console.log(`\x1b[31m SUCCESS! \x1b[0m`, aaa, bbb);
  },
});
