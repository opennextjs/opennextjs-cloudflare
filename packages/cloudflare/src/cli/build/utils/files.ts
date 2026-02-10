import fs from "node:fs";
import path from "node:path";

/**
 * Appends text to a file
 *
 * When the file does not exists, it is always created with the text content.
 * When the file exists, the text is appended only when the predicate return `true`.
 *
 * @param filepath The path to the file.
 * @param text The text to append to the file.
 * @param condition A function that receives the current file content and returns `true` if the text should be appended to it, the condition is skipped when the file is being created.
 * @param separator A string that will be inserted between the pre-existing file's content and the new text in case the file already existed.
 */
export function conditionalAppendFileSync(
	filepath: string,
	text: string,
	condition: (fileContent: string) => boolean,
	separator = ""
): void {
	const fileExists = fs.existsSync(filepath);
	const maybeFileContent = fileExists ? fs.readFileSync(filepath, "utf8") : "";

	if (!fileExists || condition(maybeFileContent)) {
		const dir = path.dirname(filepath);
		fs.mkdirSync(dir, { recursive: true });
		fs.appendFileSync(filepath, `${maybeFileContent.length > 0 ? separator : ""}${text}`);
	}
}
