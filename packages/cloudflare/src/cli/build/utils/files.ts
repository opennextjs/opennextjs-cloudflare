import fs from "node:fs";

/**
 * Appends text to a file
 * 
 * When the file does not exists, it is always created with the text content.
 * When the file exists, the text is appended only when the predicate return `true`.  
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

	if (!fileExists || condition(fs.readFileSync(filepath, "utf8"))) {
		fs.appendFileSync(filepath, `\n${text}\n`);
	}
}
