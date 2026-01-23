import fs from "node:fs";

/**
 * Creates a file with the given text, or appends to it if it already exists and the condition is met.
 *
 * @param filepath The path to the file to create or append to.
 * @param text The text to write or append to the file.
 * @param condition A function that receives the current file content and returns `true` if the text should be appended.
 */
export function createOrAppendToFile(
	filepath: string,
	text: string,
	condition: (fileContent: string) => boolean
): void {
	const fileExists = fs.existsSync(filepath);

	if (!fileExists) {
		fs.writeFileSync(filepath, text);
		return;
	}

	const fileContent = fs.readFileSync(filepath, "utf8");
	if (condition(fileContent)) {
		fs.appendFileSync(filepath, `\n${text}\n`);
	}
}
