import logger from "@opennextjs/aws/logger.js";
import { describe, expect, it, vi } from "vitest";
import type { Unstable_Config } from "wrangler";

import { build as buildImpl } from "../build/build.js";
import { askConfirmation } from "../utils/ask-confirmation.js";
import { createWranglerConfigFile } from "../utils/create-wrangler-config.js";
import { buildCommand } from "./build.js";
import { readWranglerConfig } from "./utils/utils.js";

vi.mock("../utils/is-interactive.js", () => ({
	isNonInteractiveOrCI: vi.fn(() => false),
}));

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
	readWranglerConfig: vi.fn(async () => ({ durable_objects: { bindings: [] }, services: [] })),
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

const localQueue = { name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" };
const workerService = { binding: "WORKER_SELF_REFERENCE", service: "test-worker-preview" };
const configPath = "/test/wrangler.custom.jsonc";
const configuredArgs = { ...defaultArgs, wranglerConfigPath: configPath, env: "preview" };

describe("buildCommand", () => {
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

	it("warns about the local revalidation queue's missing self-reference and continues the build", async () => {
		vi.mocked(readWranglerConfig).mockResolvedValueOnce({
			configPath,
			name: "test-worker-preview",
			durable_objects: { bindings: [localQueue] },
		} as Unstable_Config);

		await buildCommand(configuredArgs);

		expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
			"The local `DOQueueHandler` requires `WORKER_SELF_REFERENCE` for cache revalidation. " +
				"Add this binding to `services` in `/test/wrangler.custom.jsonc` for the `preview` environment and set `service` to `test-worker-preview`."
		);
		expect(buildImpl).toHaveBeenCalledOnce();
	});

	it.each([
		{ reason: "the selected environment declares no queue", bindings: [], services: [] },
		{ reason: "the self-reference is present", bindings: [localQueue], services: [workerService] },
		{
			reason: "the class runs in another Worker",
			bindings: [{ ...localQueue, script_name: "queue-worker" }],
			services: [],
		},
		{
			reason: "the binding uses a custom class",
			bindings: [{ ...localQueue, class_name: "JobQueue" }],
			services: [],
		},
		{
			reason: "the class uses another binding",
			bindings: [{ ...localQueue, name: "JOB_QUEUE" }],
			services: [],
		},
		{
			reason: "Wrangler checks are skipped",
			bindings: [localQueue],
			services: [],
			skipWranglerConfigCheck: true,
		},
	])(
		"continues without the diagnostic when $reason",
		async ({ bindings, services, skipWranglerConfigCheck }) => {
			vi.mocked(readWranglerConfig).mockResolvedValueOnce({
				configPath,
				name: "test-worker-preview",
				durable_objects: { bindings },
				services,
			} as Unstable_Config);

			await buildCommand({ ...configuredArgs, skipWranglerConfigCheck: skipWranglerConfigCheck ?? false });

			expect(logger.warn).not.toHaveBeenCalled();
			expect(buildImpl).toHaveBeenCalledOnce();
		}
	);
});
