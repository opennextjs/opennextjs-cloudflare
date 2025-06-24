import { describe, expect, it } from "vitest";

import { filesToTree } from "./compile-skew-protection";

describe("filesToTree", () => {
	it("should return an empty tree for an empty array of paths", () => {
		const paths: string[] = [];
		const tree = filesToTree(paths);
		expect(tree).toEqual({ f: [], d: {} });
	});

	it("should correctly add a single file at the root", () => {
		const paths = ["file.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: ["file.txt"],
			d: {},
		});
	});

	it("should correctly add multiple files at the root", () => {
		const paths = ["file1.txt", "file2.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: ["file1.txt", "file2.txt"],
			d: {},
		});
	});

	it("should correctly add a single file in a single folder", () => {
		const paths = ["folder/file.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: [],
			d: {
				folder: {
					f: ["file.txt"],
					d: {},
				},
			},
		});
	});

	it("should correctly add multiple files in the same folder", () => {
		const paths = ["folder/file1.txt", "folder/file2.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: [],
			d: {
				folder: {
					f: ["file1.txt", "file2.txt"],
					d: {},
				},
			},
		});
	});

	it("should correctly add files in nested folders", () => {
		const paths = ["folder1/folder2/file.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: [],
			d: {
				folder1: {
					f: [],
					d: { folder2: { f: ["file.txt"], d: {} } },
				},
			},
		});
	});

	it("should handle mixed files and folders at different levels", () => {
		const paths = ["root_file.txt", "folderA/fileA.txt", "folderA/subfolderB/fileB.txt", "folderC/fileC.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: ["root_file.txt"],
			d: {
				folderA: {
					f: ["fileA.txt"],
					d: {
						subfolderB: {
							f: ["fileB.txt"],
							d: {},
						},
					},
				},
				folderC: {
					f: ["fileC.txt"],
					d: {},
				},
			},
		});
	});

	it("should handle paths with leading/trailing slashes gracefully", () => {
		const paths = ["/folder/file.txt", "another_folder/file.txt/"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: [],
			d: {
				folder: {
					f: ["file.txt"],
					d: {},
				},
				another_folder: {
					f: ["file.txt"], // Trailing slash on file name is removed by filter(Boolean)
					d: {},
				},
			},
		});
	});

	it("should handle duplicate file names in different folders", () => {
		const paths = ["folder1/file.txt", "folder2/file.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: [],
			d: {
				folder1: {
					f: ["file.txt"],
					d: {},
				},
				folder2: {
					f: ["file.txt"],
					d: {},
				},
			},
		});
	});

	it("should handle folders with the same name but different parents", () => {
		const paths = ["a/b/file1.txt", "c/b/file2.txt"];
		const tree = filesToTree(paths);
		expect(tree).toEqual({
			f: [],
			d: {
				a: {
					f: [],
					d: {
						b: {
							f: ["file1.txt"],
							d: {},
						},
					},
				},
				c: {
					f: [],
					d: {
						b: {
							f: ["file2.txt"],
							d: {},
						},
					},
				},
			},
		});
	});
});
