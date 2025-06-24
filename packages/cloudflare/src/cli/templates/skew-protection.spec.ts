import { describe, expect, it } from "vitest";

import { filesToTree } from "../build/open-next/compile-skew-protection.js";
import { isFileInTree } from "./skew-protection.js";

describe("isFileInTree", () => {
	const samplePaths = [
		"file1.txt",
		"folderA/fileA.txt",
		"folderA/subfolderB/fileB.txt",
		"folderC/fileC.txt",
		"folderC/nested/fileD.txt",
		"folderC/nested/anotherFile.txt",
		"/root_file_with_slash.txt",
	];
	const tree = filesToTree(samplePaths);

	it("should return true for a file existing at the root", () => {
		expect(isFileInTree("file1.txt", tree)).toBe(true);
	});

	it("should return true for a file existing in a single folder", () => {
		expect(isFileInTree("folderA/fileA.txt", tree)).toBe(true);
	});

	it("should return true for a file existing in a nested folder", () => {
		expect(isFileInTree("folderA/subfolderB/fileB.txt", tree)).toBe(true);
	});

	it("should return true for another file in a nested folder", () => {
		expect(isFileInTree("folderC/nested/anotherFile.txt", tree)).toBe(true);
	});

	it("should return true for a file with a leading slash if it's at the root", () => {
		expect(isFileInTree("/root_file_with_slash.txt", tree)).toBe(true);
	});

	it("should return false for a file that does not exist at the root", () => {
		expect(isFileInTree("nonexistent.txt", tree)).toBe(false);
	});

	it("should return false for a file that does not exist in an existing folder", () => {
		expect(isFileInTree("folderA/nonexistent.txt", tree)).toBe(false);
	});

	it("should return false for a file that does not exist in a nonexistent folder", () => {
		expect(isFileInTree("nonexistentFolder/file.txt", tree)).toBe(false);
	});

	it("should return false for a file that does not exist in a nested nonexistent folder", () => {
		expect(isFileInTree("folderA/nonexistentSubfolder/file.txt", tree)).toBe(false);
	});

	it("should return false for an empty filename", () => {
		expect(isFileInTree("", tree)).toBe(false);
	});

	it("should return false for a filename that is just a folder name", () => {
		expect(isFileInTree("folderA", tree)).toBe(false);
		expect(isFileInTree("folderA/subfolderB", tree)).toBe(false);
	});

	it("should return false for a filename that is just a folder name with a trailing slash", () => {
		expect(isFileInTree("folderA/", tree)).toBe(false);
		expect(isFileInTree("folderA/subfolderB/", tree)).toBe(false);
	});

	it("should return false for a file in an incorrect path segment", () => {
		expect(isFileInTree("folderC/fileA.txt", tree)).toBe(false); // fileA.txt is in folderA
	});

	it("should handle a tree with no files gracefully", () => {
		const emptyTree = filesToTree([]);
		expect(isFileInTree("anyfile.txt", emptyTree)).toBe(false);
		expect(isFileInTree("folder/file.txt", emptyTree)).toBe(false);
	});
});
