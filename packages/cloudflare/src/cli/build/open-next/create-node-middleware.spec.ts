import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { build } from "esbuild";
import { afterEach, describe, expect, test } from "vitest";

import { rejectUnsupportedRuntimePlugin } from "./create-node-middleware.js";

let tmpDir: string | undefined;

afterEach(() => {
	if (tmpDir) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		tmpDir = undefined;
	}
});

describe("rejectUnsupportedRuntimePlugin", () => {
	test("rejects unsupported modules imported through middleware helpers", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opennext-node-middleware-"));
		fs.writeFileSync(path.join(tmpDir, "helper.js"), `import "node:fs";\nexport const value = 1;\n`);

		await expect(
			build({
				stdin: {
					contents: `import { value } from "./helper.js";\nexport default value;\n`,
					resolveDir: tmpDir,
					loader: "js",
				},
				bundle: true,
				format: "esm",
				write: false,
				plugins: [rejectUnsupportedRuntimePlugin()],
				logLevel: "silent",
			})
		).rejects.toThrow('Node.js middleware/proxy imports unsupported module "node:fs"');
	});

	test("rejects native addons imported through middleware helpers", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opennext-node-middleware-"));
		fs.writeFileSync(path.join(tmpDir, "helper.js"), `import "./native.node";\nexport const value = 1;\n`);

		await expect(
			build({
				stdin: {
					contents: `import { value } from "./helper.js";\nexport default value;\n`,
					resolveDir: tmpDir,
					loader: "js",
				},
				bundle: true,
				format: "esm",
				write: false,
				plugins: [rejectUnsupportedRuntimePlugin()],
				logLevel: "silent",
			})
		).rejects.toThrow('Node.js middleware/proxy imports native addon "./native.node"');
	});

	test("allows Next internals that are already present in the generated middleware bundle", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opennext-node-middleware-"));
		const nextDistDir = path.join(tmpDir, "node_modules", "next", "dist");
		fs.mkdirSync(nextDistDir, { recursive: true });
		fs.writeFileSync(path.join(nextDistDir, "helper.js"), `import "node:fs";\nexport const value = 1;\n`);

		await expect(
			build({
				stdin: {
					contents: `import { value } from "next/dist/helper.js";\nexport default value;\n`,
					resolveDir: tmpDir,
					loader: "js",
				},
				bundle: true,
				external: ["node:*"],
				format: "esm",
				platform: "node",
				write: false,
				plugins: [rejectUnsupportedRuntimePlugin()],
				logLevel: "silent",
			})
		).resolves.toBeDefined();
	});
});
