import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(workspace, "packages/cloudflare/dist/cli/index.js");
const example = path.join(workspace, "examples/bugs/gh-119");
// Keep the copy in the workspace and at the same depth as the example for pnpm's relative bin paths.
const scratch = path.join(workspace, ".open-next", "build-fixtures");
const fixtureEntries = [
	"app",
	"next.config.ts",
	"open-next.config.ts",
	"package.json",
	"postcss.config.mjs",
	"public",
	"tailwind.config.ts",
	"tsconfig.json",
	"wrangler.jsonc",
];

function copyExample(t, excluded) {
	mkdirSync(scratch, { recursive: true });
	const project = mkdtempSync(path.join(scratch, "build-cli-"));
	t.after(() => rmSync(project, { recursive: true, force: true }));
	for (const entry of fixtureEntries) {
		if (entry !== excluded) {
			cpSync(path.join(example, entry), path.join(project, entry), { recursive: true });
		}
	}
	symlinkSync(path.join(example, "node_modules"), path.join(project, "node_modules"), "junction");
	return project;
}

function stopBuild(child) {
	if (!child.pid) return;
	if (process.platform === "win32") {
		const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
		if (result.status !== 0) child.kill("SIGKILL");
		return;
	}
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch (error) {
		if (error.code !== "ESRCH") child.kill("SIGKILL");
	}
}

async function build(project, timeout, env = process.env) {
	const child = spawn(process.execPath, [cli, "build"], {
		cwd: project,
		detached: process.platform !== "win32",
		env: {
			...env,
			NEXT_TELEMETRY_DISABLED: "1",
			SKIP_NEXT_APP_BUILD: "false",
			SKIP_WRANGLER_CONFIG_CHECK: "false",
			WRANGLER_SEND_METRICS: "false",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
	child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		// Next is a subprocess of the CLI. Stop the tree before the fixture is removed.
		stopBuild(child);
	}, timeout);
	try {
		const [status] = await once(child, "close");
		assert.ok(!timedOut, `Build timed out after ${timeout} ms\n${stdout}${stderr}`);
		return { status, stderr, stdout };
	} finally {
		clearTimeout(timer);
	}
}

for (const [config, errorMessage, guidance] of [
	[
		"open-next.config.ts",
		"Error: No `open-next.config.ts` file was found",
		"Run `opennextjs-cloudflare migrate`",
	],
	[
		"wrangler.jsonc",
		"Error: No `wrangler.(toml|json|jsonc)` config file found.",
		"--skipWranglerConfigCheck",
	],
]) {
	test(`build reports missing ${config} in a non-interactive process`, async (t) => {
		const project = copyExample(t, config);
		// Preserve the environment esbuild needs while omitting CI and runner-specific variables.
		const { PATH, SystemRoot, TEMP, TMP, TMPDIR } = process.env;
		const { status, stderr, stdout } = await build(project, 20_000, { PATH, SystemRoot, TEMP, TMP, TMPDIR });

		assert.equal(status, 1, stdout + stderr);
		assert.ok(stderr.includes(errorMessage), stderr);
		assert.ok(stderr.includes(guidance), stderr);
		assert.doesNotMatch(stdout + stderr, /do you want to create one/i);
		assert.equal(existsSync(path.join(project, ".open-next/worker.js")), false);
	});
}

test("build emits a Worker entry and server bundle without starting preview", async (t) => {
	const project = copyExample(t);
	const { status, stderr, stdout } = await build(project, 120_000);
	const outputDir = path.join(project, ".open-next");

	assert.equal(status, 0, stdout + stderr);
	assert.match(stdout, /OpenNext build complete\./);
	assert.ok(statSync(path.join(outputDir, "worker.js")).size > 0);

	const serverDir = path.join(outputDir, "server-functions/default", path.relative(workspace, project));
	assert.ok(statSync(path.join(serverDir, "handler.mjs")).size > 0);
	const metafile = JSON.parse(readFileSync(path.join(serverDir, "handler.mjs.meta.json"), "utf8"));
	assert.ok(
		Object.entries(metafile.outputs).some(
			([file, output]) => path.basename(file) === "handler.mjs" && output.bytes > 0
		)
	);
});
