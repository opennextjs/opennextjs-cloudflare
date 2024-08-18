import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { esbuildAsync } from "../../utils";

// this practically does this: https://github.com/sst/open-next/blob/f61b0e9486/packages/open-next/src/build/createServerBundle.ts#L247
export async function runBuild(outputPath: string, packagePath: string) {
  debugger;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  await esbuildAsync({
    entryPoints: [path.join(currentDir, "./templates", "server-adapter.ts")],
    external: ["next", "./middleware.mjs", "./next-server.runtime.prod.js"],
    outfile: path.join(outputPath, packagePath, `index.mjs`),
    banner: {
      js: [
        "import process from 'node:process';",
        "import { Buffer } from 'node:buffer';",
        "import { createRequire as topLevelCreateRequire } from 'module';",
        "const require = topLevelCreateRequire(import.meta.url);",
        "import bannerUrl from 'url';",
        "const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));",
      ].join(""),
    },
    plugins: [], // TODO: are there plugins we need?
  });
}
