/**
 * This function transforms the exports (or imports) object from the package.json
 * to only include the build condition if found (e.g. "workerd") and remove everything else.
 * If no build condition is found, it keeps everything as is.
 * It also returns a boolean indicating if the build condition was found.
 * @param conditionMap The exports (or imports) object from the package.json
 * @param condition The build condition to look for
 * @returns An object with the transformed exports and a boolean indicating if the build condition was found
 */
export function transformBuildCondition(
	conditionMap: { [key: string]: unknown },
	condition: string
): {
	transformedExports: { [key: string]: unknown };
	hasBuildCondition: boolean;
} {
	const transformed: { [key: string]: unknown } = {};
	const hasTopLevelBuildCondition = condition in conditionMap && conditionMap[condition] != null;
	let hasBuildCondition = hasTopLevelBuildCondition;
	for (const [key, value] of Object.entries(conditionMap)) {
		if (typeof value === "object" && value != null) {
			const { transformedExports, hasBuildCondition: innerBuildCondition } = transformBuildCondition(
				value as { [key: string]: unknown },
				condition
			);

			// If a build condition is present at this level but a sibling
			// subtree doesn't contain the build condition, we can drop it entirely.
			if (hasTopLevelBuildCondition && key !== condition && !innerBuildCondition) {
				continue;
			}

			transformed[key] = transformedExports;
			hasBuildCondition ||= innerBuildCondition;
		} else if (!hasTopLevelBuildCondition || key === condition) {
			// If there is no build condition at this level or this is a non-object build condition,
			// we need to keep the child condition as is.
			transformed[key] = value;
		}
	}
	return { transformedExports: transformed, hasBuildCondition };
}
// We only care about these fields
export interface PackageJson {
	name: string;
	// Note: `exports` can be a string, i.e. `"exports": "./index.js"`
	exports?: string | { [key: string]: unknown };
	imports?: { [key: string]: unknown };
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

/**
 *
 * @param json The package.json object
 * @returns An object with the transformed package.json and a boolean indicating if the build condition was found
 */
export function transformPackageJson(json: PackageJson) {
	const transformed: PackageJson = structuredClone(json);
	let hasBuildCondition = false;
	if (json.exports && typeof json.exports === "object") {
		const exp = transformBuildCondition(json.exports, "workerd");
		transformed.exports = exp.transformedExports;
		hasBuildCondition ||= exp.hasBuildCondition;
	}
	if (json.imports) {
		const imp = transformBuildCondition(json.imports, "workerd");
		transformed.imports = imp.transformedExports;
		hasBuildCondition ||= imp.hasBuildCondition;
	}
	return { transformed, hasBuildCondition };
}
