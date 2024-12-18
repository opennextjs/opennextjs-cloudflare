/**
 * ESBuild does not support CJS format
 * See https://github.com/evanw/esbuild/issues/1921 and linked issues
 * Some of the solutions are based on `module.createRequire()` not implemented in workerd.
 * James on Aug 29: `module.createRequire()` is planned.
 */
export function patchRequire(code: string): string {
  return code.replace(/__require\d?\(/g, "require(").replace(/__require\d?\./g, "require.");
}
