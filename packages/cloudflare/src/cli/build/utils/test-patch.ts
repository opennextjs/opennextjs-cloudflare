import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	getInstalledNextPackages as getNextPackages,
	type NextPackage,
} from "@opennextjs/aws/build/patch/testUtils.js";

const examplesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../examples");

/**
 * Get the Next.js packages installed in the examples.
 *
 * The default examples cover both Next.js versions used in the repository: the default catalog (`playground15`)
 * and the `e2e` catalog (`playground16`, `e2e/experimental`).
 *
 * @param examples Path of the examples, relative to the `examples` directory
 * @returns the path and version of the Next.js packages, deduplicated by version
 * @throws When `next` can not be resolved from one of the examples
 */
export function getInstalledNextPackages(
	examples = ["playground15", "playground16", "e2e/experimental"]
): NextPackage[] {
	return getNextPackages(examples.map((example) => path.join(examplesDir, example)));
}
