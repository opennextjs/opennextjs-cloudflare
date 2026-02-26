import { afterEach, describe, expect, it, vi } from "vitest";

import { askConfirmation } from "../../utils/ask-confirmation.js";
import { createOpenNextConfigFile, findOpenNextConfig } from "../../utils/create-open-next-config.js";
import { compileConfig } from "./utils.js";

const { mockExistsSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(),
}));

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
const mockCompileOpenNextConfig = vi.fn(async () => ({
	config: { default: {} },
	buildDir: "/build",
}));
vi.mock("@opennextjs/aws/build/compileConfig.js", () => ({
	compileOpenNextConfig: (...args: unknown[]) => mockCompileOpenNextConfig(...args),
}));

// Mock ensureCloudflareConfig
vi.mock("../../build/utils/ensure-cf-config.js", () => ({
	ensureCloudflareConfig: vi.fn(),
}));

// Mock askConfirmation
vi.mock("../../utils/ask-confirmation.js", () => ({
	askConfirmation: vi.fn(),
}));

// Mock create-config-files (unused import in utils.ts but required for module resolution)
vi.mock("../../utils/create-config-files.js", () => ({
	createOpenNextConfigIfNotExistent: vi.fn(),
}));

// Mock create-open-next-config
vi.mock("../../utils/create-open-next-config.js", () => ({
	findOpenNextConfig: vi.fn(),
	createOpenNextConfigFile: vi.fn(() => "/test/open-next.config.ts"),
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
	afterEach(() => {
		vi.restoreAllMocks();
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
});
