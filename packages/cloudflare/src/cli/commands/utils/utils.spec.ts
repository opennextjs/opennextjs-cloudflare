import fs from "node:fs";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { normalizeOptions } from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { afterAll, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { askConfirmation } from "../../utils/ask-confirmation.js";
import { createOpenNextConfigFile, findOpenNextConfig } from "../../utils/create-open-next-config.js";
import { isNonInteractiveOrCI } from "../../utils/is-interactive.js";
import { compileConfig, retrieveCompiledConfig } from "./utils.js";

const { mockExistsSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(),
}));

// `nextAppDir` is the cwd at import time, point it to a temp app dir.
const { appDir } = await vi.hoisted(async () => {
	const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
	const os = await vi.importActual<typeof import("node:os")>("node:os");
	const path = await vi.importActual<typeof import("node:path")>("node:path");
	const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "retrieve-compiled-config-"));
	process.chdir(appDir);
	return { appDir };
});

// Mock node:fs — only override existsSync
vi.mock("node:fs", async (importOriginal) => {
	const mod = await importOriginal<typeof import("node:fs")>();
	return { ...mod, existsSync: mockExistsSync };
});

// Mock logger
vi.mock("@opennextjs/aws/logger.js", () => ({
	default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn() },
}));

// Mock compileOpenNextConfig
const mockCompileOpenNextConfig = vi.fn(async (...args: [unknown, unknown]) => {
	void args;

	return {
		config: { default: {} },
		buildDir: "/build",
	};
});
vi.mock("@opennextjs/aws/build/compileConfig.js", () => ({
	compileOpenNextConfig: (...args: [unknown, unknown]) => mockCompileOpenNextConfig(...args),
}));

// Mock ensureCloudflareConfig
vi.mock("../../build/utils/ensure-cf-config.js", () => ({
	ensureCloudflareConfig: vi.fn(),
}));

// Mock askConfirmation
vi.mock("../../utils/ask-confirmation.js", () => ({
	askConfirmation: vi.fn(),
}));

// Mock CI/non-interactive detector — default to interactive local behavior.
vi.mock("../../utils/is-interactive.js", () => ({
	isNonInteractiveOrCI: vi.fn(() => false),
}));

// Mock create-config-files (unused import in utils.ts but required for module resolution)
vi.mock("../../utils/create-config-files.js", () => ({
	createOpenNextConfigIfNotExistent: vi.fn(),
}));

// Mock create-open-next-config
vi.mock("../../utils/create-open-next-config.js", () => ({
	findOpenNextConfig: vi.fn(),
	createOpenNextConfigFile: vi.fn(() => "/test/open-next.config.ts"),
	OPEN_NEXT_CONFIG_FILE_NAME: "open-next.config.ts",
}));

// Mock wrangler
vi.mock("wrangler", () => ({
	unstable_readConfig: vi.fn(),
}));

// Mock build utils
vi.mock("@opennextjs/aws/build/utils.js", () => ({
	printHeader: vi.fn(),
	showWarningOnWindows: vi.fn(),
}));

// Mock build helper
vi.mock("@opennextjs/aws/build/helper.js", () => ({
	normalizeOptions: vi.fn(() => ({})),
}));

describe("compileConfig", () => {
	beforeEach(() => {
		vi.mocked(isNonInteractiveOrCI).mockReturnValue(false);
	});

	it("should compile config when configPath is provided and file exists", async () => {
		mockExistsSync.mockReturnValue(true);

		const result = await compileConfig("/app/open-next.config.ts");

		expect(mockCompileOpenNextConfig).toHaveBeenCalledWith("/app/open-next.config.ts", { compileEdge: true });
		expect(result).toEqual({ config: { default: {} }, buildDir: "/build" });
	});

	it("should throw when configPath is provided but file does not exist", async () => {
		mockExistsSync.mockReturnValue(false);

		await expect(compileConfig("/app/missing-config.ts")).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Custom config file not found at /app/missing-config.ts]`
		);
	});

	it("should compile config when no configPath is provided but one is found", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue("/app/open-next.config.ts");

		const result = await compileConfig(undefined);

		expect(findOpenNextConfig).toHaveBeenCalledOnce();
		expect(mockCompileOpenNextConfig).toHaveBeenCalledWith("/app/open-next.config.ts", { compileEdge: true });
		expect(result).toEqual({ config: { default: {} }, buildDir: "/build" });
	});

	it("should create config when no configPath found and user confirms", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue(undefined);
		vi.mocked(askConfirmation).mockResolvedValue(true);

		const result = await compileConfig(undefined);

		expect(askConfirmation).toHaveBeenCalledOnce();
		expect(vi.mocked(askConfirmation).mock.calls[0]).toMatchInlineSnapshot(`
			[
			  "Missing required \`open-next.config.ts\` file, do you want to create one?",
			]
		`);
		expect(createOpenNextConfigFile).toHaveBeenCalledOnce();
		expect(mockCompileOpenNextConfig).toHaveBeenCalledWith("/test/open-next.config.ts", {
			compileEdge: true,
		});
		expect(result).toEqual({ config: { default: {} }, buildDir: "/build" });
	});

	it("should throw when no configPath found and user declines", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue(undefined);
		vi.mocked(askConfirmation).mockResolvedValue(false);

		await expect(compileConfig(undefined)).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The \`open-next.config.ts\` file is required, aborting!]`
		);

		expect(askConfirmation).toHaveBeenCalledOnce();
		expect(createOpenNextConfigFile).not.toHaveBeenCalled();
	});

	it("should throw a helpful error (without prompting) when no configPath found in a non-interactive environment", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue(undefined);
		vi.mocked(isNonInteractiveOrCI).mockReturnValue(true);

		await expect(compileConfig(undefined)).rejects.toThrowError(
			/No `open-next\.config\.ts` file was found.*opennextjs-cloudflare migrate/s
		);

		expect(askConfirmation).not.toHaveBeenCalled();
		expect(createOpenNextConfigFile).not.toHaveBeenCalled();
	});

	it("should still prompt in interactive environments", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue(undefined);
		vi.mocked(isNonInteractiveOrCI).mockReturnValue(false);
		vi.mocked(askConfirmation).mockResolvedValue(true);

		await compileConfig(undefined);

		expect(askConfirmation).toHaveBeenCalledOnce();
		expect(createOpenNextConfigFile).toHaveBeenCalledOnce();
	});
});

describe("retrieveCompiledConfig", () => {
	const defaultBuildDir = path.join(appDir, ".open-next/.build");
	const customBuildDir = path.join(appDir, "custom/.open-next/.build");
	const sourceConfigPath = path.join(appDir, "open-next.config.ts");

	function writeCompiledConfig(buildDir: string, config: object) {
		fs.mkdirSync(buildDir, { recursive: true });
		fs.writeFileSync(
			path.join(buildDir, "open-next.config.edge.mjs"),
			`export default ${JSON.stringify(config)};`
		);
	}

	let exitSpy: MockInstance<typeof process.exit>;

	beforeEach(() => {
		fs.rmSync(path.join(appDir, ".open-next"), { recursive: true, force: true });
		fs.rmSync(path.join(appDir, "custom"), { recursive: true, force: true });
		fs.writeFileSync(sourceConfigPath, "export default { default: {} };");
		mockExistsSync.mockImplementation(fs.existsSync);
		vi.mocked(normalizeOptions).mockImplementation(
			(config) =>
				({
					buildDir: path.join(appDir, config.buildOutputPath ?? ".", ".open-next/.build"),
				}) as BuildOptions
		);
		mockCompileOpenNextConfig.mockResolvedValue({
			config: { default: {}, buildOutputPath: "custom" },
			buildDir: "/build",
		});
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
	});

	afterAll(() => {
		fs.rmSync(appDir, { recursive: true, force: true });
	});

	it("should load the compiled config from the default build output", async () => {
		writeCompiledConfig(defaultBuildDir, { default: {}, fromBuild: "default" });

		const result = await retrieveCompiledConfig();

		expect(result.config).toEqual({ default: {}, fromBuild: "default" });
		expect(mockCompileOpenNextConfig).not.toHaveBeenCalled();
	});

	it("should load the compiled config from a custom buildOutputPath", async () => {
		writeCompiledConfig(customBuildDir, { default: {}, buildOutputPath: "custom", fromBuild: "custom" });
		vi.mocked(findOpenNextConfig).mockReturnValue(sourceConfigPath);

		const result = await retrieveCompiledConfig();

		expect(mockCompileOpenNextConfig).toHaveBeenCalledWith(sourceConfigPath, {
			compileEdge: true,
		});
		// The config compiled by the build is used, not the one recompiled from source.
		expect(result.config).toEqual({ default: {}, buildOutputPath: "custom", fromBuild: "custom" });
	});

	it("should report a missing build when there is no source config either", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue(undefined);

		await expect(retrieveCompiledConfig()).rejects.toThrowError("process.exit");

		expect(logger.error).toHaveBeenCalledWith(
			"Could not find compiled Open Next config, did you run the build command?"
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(askConfirmation).not.toHaveBeenCalled();
		expect(createOpenNextConfigFile).not.toHaveBeenCalled();
	});

	it("should report a missing build when the source config exists but the app was never built", async () => {
		vi.mocked(findOpenNextConfig).mockReturnValue(sourceConfigPath);

		await expect(retrieveCompiledConfig()).rejects.toThrowError("process.exit");

		expect(logger.error).toHaveBeenCalledWith(
			"Could not find compiled Open Next config, did you run the build command?"
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
