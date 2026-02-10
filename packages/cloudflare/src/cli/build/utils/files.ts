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
 * @param opts.appendIf A function that receives the current file content and returns `true` if the text should be appended to it, the condition is skipped when the file is being created. Defaults to a function that always returns true.
 * @param opts.appendPrefix A string that will be inserted between the pre-existing file's content and the new text in case the file already existed. Defaults to an empty string.
 */
export function conditionalAppendFileSync(
	filepath: string,
	text: string,
	{
		appendIf = () => true,
		appendPrefix = "",
	}: {
		appendIf?: (fileContent: string) => boolean;
		appendPrefix?: string;
	} = {}
): void {
	const fileExists = fs.existsSync(filepath);
	const maybeFileContent = fileExists ? fs.readFileSync(filepath, "utf8") : "";

	if (!fileExists) {
		const dir = path.dirname(filepath);
		fs.mkdirSync(dir, { recursive: true });
	}

	if (!fileExists || appendIf(maybeFileContent)) {
		fs.appendFileSync(filepath, `${maybeFileContent.length > 0 ? appendPrefix : ""}${text}`);
	}
}
