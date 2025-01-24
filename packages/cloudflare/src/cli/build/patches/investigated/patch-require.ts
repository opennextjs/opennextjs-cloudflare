/**
 * Replaces webpack `__require` with actual `require`
 */
export function patchRequire(code: string): string {
  return code.replace(/__require\d?\(/g, "require(").replace(/__require\d?\./g, "require.");
}
