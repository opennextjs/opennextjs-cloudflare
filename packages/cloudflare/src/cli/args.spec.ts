import { describe, expect, it } from "vitest";

import { getPassthroughArgs } from "./args.js";

describe("getPassthroughArgs", () => {
	it("should return args not used by the cli", () => {
		const args = [
			"pnpm",
			"/opennextjs/cloudflare/examples/ssg-app/node_modules/@opennextjs/cloudflare/dist/cli/index.js",
			"preview",
			"--skipBuild",
			"--preview",
			"-t",
			"-v=1",
			"-pre",
			"152",
			"--pre2=1543",
			"--",
			"--port",
			"1234",
			"--inspector-port",
			"1234",
		];

		expect(getPassthroughArgs(args, { options: { skipBuild: { type: "boolean" } } })).toEqual([
			"--preview",
			"-t",
			"-v=1",
			"-pre",
			"152",
			"--pre2=1543",
			"--port",
			"1234",
			"--inspector-port",
			"1234",
		]);
	});
});
