import logger from "@opennextjs/aws/logger.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { askConfirmation } from "../utils/ask-confirmation.js";
import { createWranglerConfigFile } from "../utils/create-wrangler-config.js";
import { buildCommand } from "./build.js";

// Mock logger
vi.mock("@opennextjs/aws/logger.js", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		setLevel: vi.fn(),
	},
}));

// Mock build implementation
vi.mock("../build/build.js", () => ({
	build: vi.fn(),
}));

// Mock askConfirmation
vi.mock("../utils/ask-confirmation.js", () => ({
	askConfirmation: vi.fn(),
}));

// Mock create-wrangler-config: findWranglerConfig returns undefined (no config found)
vi.mock("../utils/create-wrangler-config.js", () => ({
	findWranglerConfig: vi.fn(() => undefined),
	createWranglerConfigFile: vi.fn(async () => ({ cachingEnabled: false })),
}));

// Mock utils
vi.mock("./utils/utils.js", () => ({
	compileConfig: vi.fn(async () => ({ config: {}, buildDir: "" })),
	getNormalizedOptions: vi.fn(() => ({})),
	readWranglerConfig: vi.fn(async () => ({})),
	printHeaders: vi.fn(),
	nextAppDir: "/test",
	withWranglerOptions: vi.fn(),
	withWranglerPassthroughArgs: vi.fn(),
}));

const defaultArgs = {
	skipNextBuild: false,
	noMinify: false,
	skipWranglerConfigCheck: false,
	openNextConfigPath: undefined,
	dangerouslyUseUnsupportedNextVersion: false,
	wranglerArgs: [],
	wranglerConfigPath: undefined,
	env: undefined,
};

describe("buildCommand", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should create wrangler config when user confirms", async () => {
		vi.mocked(askConfirmation).mockResolvedValue(true);

		await buildCommand(defaultArgs);

		expect(askConfirmation).toHaveBeenCalledOnce();
		expect(vi.mocked(askConfirmation).mock.calls[0]).toMatchInlineSnapshot(`
			[
			  "No \`wrangler.(toml|json|jsonc)\` config file found, do you want to create one?",
			]
		`);
		expect(createWranglerConfigFile).toHaveBeenCalledOnce();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("should warn when user declines wrangler config creation", async () => {
		vi.mocked(askConfirmation).mockResolvedValue(false);

		await buildCommand(defaultArgs);

		expect(askConfirmation).toHaveBeenCalledOnce();
		expect(createWranglerConfigFile).not.toHaveBeenCalled();
		expect(vi.mocked(logger.warn).mock.calls[0]).toMatchInlineSnapshot(`
			[
			  "No Wrangler config file created

			(to avoid this check use the \`--skipWranglerConfigCheck\` flag or set a \`SKIP_WRANGLER_CONFIG_CHECK\` environment variable to \`yes\`)",
			]
		`);
	});
});
