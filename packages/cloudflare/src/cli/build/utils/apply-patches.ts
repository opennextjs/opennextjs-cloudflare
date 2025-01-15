/**
 * Applies multiple code patches in order to a given piece of code, at each step it validates that the code
 * has actually been patched/changed, if not an error is thrown
 *
 * @param code the code to apply the patches to
 * @param patches array of tuples, containing a string indicating the target of the patching (for logging) and
 *                a patching function that takes a string (pre-patch code) and returns a string (post-patch code)
 * @returns the patched code
 */
export async function patchCodeWithValidations(
  code: string,
  patches: [string, (code: string) => string | Promise<string>, opts?: { isOptional?: boolean }][]
): Promise<string> {
  console.log(`Applying code patches:`);
  let patchedCode = code;

  for (const [target, patchFunction, opts] of patches) {
    console.log(` - patching ${target}`);

    const prePatchCode = patchedCode;
    patchedCode = await patchFunction(patchedCode);

    if (!opts?.isOptional && prePatchCode === patchedCode) {
      throw new Error(`Failed to patch ${target}`);
    }
  }

  console.log(`All ${patches.length} patches applied\n`);
  return patchedCode;
}
