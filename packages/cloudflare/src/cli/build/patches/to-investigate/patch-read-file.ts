import { type BuildOptions, getBuildId } from "@opennextjs/aws/build/helper.js";

export function patchBuildId(code: string, buildOpts: BuildOptions): string {
  // The Next code gets the buildId from the filesystem so we hardcode the value at build time.
  return code.replace(
    "getBuildId() {",
    `getBuildId() {
      return ${JSON.stringify(getBuildId(buildOpts))};
    `
  );
}
