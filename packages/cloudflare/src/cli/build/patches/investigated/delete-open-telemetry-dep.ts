import { rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Given a directory path, it deletes a `node_modules/@opentelemetry` subdirectory if present.
 *
 * Explanation:
 *  The standard `@opentelemetry/api` library doesn't work in workerd since there are paths that it can't resolve (without a
 *  compilation step), fortunately Next.js has a try-catch statement that replaces, when failing, `require('@opentelemetry/api')`
 *  calls with a precompiled version of the library ('next/dist/compiled/@opentelemetry/api') which does properly in our runtime
 *  (source code: https://github.com/vercel/next.js/blob/9e8266a7/packages/next/src/server/lib/trace/tracer.ts#L27-L31)
 *
 *  So this function is used to delete the `@opentelemetry` dependency entirely so to guarantee that
 *  `require('@opentelemetry/api')` fail ensuring that the precompiled version is used
 */
export async function deleteOpenTelemetryDep(path: string): Promise<void> {
  const nodeModulesDirPath = join(path, "node_modules");

  rmSync(join(nodeModulesDirPath, "@opentelemetry"), {
    recursive: true,
    force: true,
  });
}
