import fs from "node:fs";

/**
 * Runs fs' `appendFileSync` on a target file, but only a specified condition is met in regards to the file's content.
 *
 * @param filepath The path to the file.
 * @param text The text to append to the file.
 * @param condition A function that receives the current file content and returns `true` if the text should be appended to it, the condition is skipped when the file is being created.
 */
export function conditionalAppendFileSync(
	filepath: string,
	text: string,
	condition: (fileContent: string) => boolean
): void {
	const fileExists = fs.existsSync(filepath);

	const fileContent = fileExists ? fs.readFileSync(filepath, "utf8") : undefined;

	if (fileContent !== undefined && condition(fileContent)) {
		fs.appendFileSync(filepath, `\n${text}\n`);
	}
}
