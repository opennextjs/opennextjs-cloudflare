import { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { getWranglerEnvArgs, runWrangler } from "./run-wrangler.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

describe("getWranglerEnvArgs", () => {
	it.each([
		{ env: undefined, expected: [] },
		{ env: "staging", expected: ["--env", "staging"] },
		{ env: "", expected: ['--env=""'] },
	])("should return $expected for env=$env", ({ env, expected }) => {
		expect(getWranglerEnvArgs(env)).toEqual(expected);
	});

	it("should keep an empty env when the args are passed through a shell", async () => {
		const { spawnSync: actualSpawnSync } =
			await vi.importActual<typeof import("node:child_process")>("node:child_process");

		const result = actualSpawnSync(
			process.execPath,
			["-e", '"console.log(JSON.stringify(process.argv.slice(1)))"', "--", ...getWranglerEnvArgs("")],
			{ shell: true, encoding: "utf-8" }
		);

		expect(JSON.parse(result.stdout)).toEqual(["--env="]);
	});
});

describe("runWrangler", () => {
	it("should forward an empty environment", () => {
		vi.mocked(spawnSync).mockReturnValueOnce({
			status: 0,
			stdout: Buffer.from(""),
			stderr: Buffer.from(""),
			pid: 0,
			output: [],
			signal: null,
		});

		runWrangler({ packager: "pnpm", monorepoRoot: "/" }, ["kv bulk put"], {
			environment: "",
			logging: "none",
		});

		expect(vi.mocked(spawnSync).mock.calls[0]?.[1]).toEqual(["exec", "wrangler", "kv bulk put", '--env=""']);
	});
});
