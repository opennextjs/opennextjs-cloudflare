#!/usr/bin/env node
// Build every example app and capture the bundle size reported by
// `wrangler deploy --dry-run` so before/after comparisons are cheap.
//
// Usage:
//   node scripts/bundle-sizes.mjs                 # build + measure all apps
//   node scripts/bundle-sizes.mjs --skip-build    # only re-run wrangler dry-run
//   node scripts/bundle-sizes.mjs --filter app-router,middleware
//   node scripts/bundle-sizes.mjs --output sizes.before.json
//   node scripts/bundle-sizes.mjs --compare sizes.before.json
//
// Typical workflow:
//   git checkout main
//   node scripts/bundle-sizes.mjs --output sizes.before.json
//   git checkout my-branch
//   node scripts/bundle-sizes.mjs --compare sizes.before.json

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = parseArgs(process.argv.slice(2));

const script = args.script;

const apps = discoverApps().filter((app) => {
	if (!args.filter) return true;
	return args.filter.some((f) => app.name.includes(f));
});

if (apps.length === 0) {
	console.error("No matching apps.");
	process.exit(1);
}

console.log(`Measuring ${apps.length} app(s)...\n`);

if (!args.skipBuild) {
	console.log(`Building all workers with \`pnpm -r ${script}\`...`);
	const filterArgs = args.filter ? apps.flatMap((a) => ["--filter", a.name]) : [];
	run("pnpm", [...filterArgs, "-r", script], { cwd: repoRoot });
	console.log("");
}

const results = {};
for (const app of apps) {
	console.log(`→ ${app.name}`);
	try {
		const size = measure(app);
		results[app.name] = size;
		console.log(`  ${fmt(size.uploadBytes)} (gzip ${fmt(size.gzipBytes)})\n`);
	} catch (err) {
		console.error(`  FAILED: ${err.message}\n`);
		results[app.name] = { error: err.message };
	}
}

if (args.output) {
	writeFileSync(args.output, JSON.stringify(results, null, 2));
	console.log(`Wrote ${args.output}`);
}

if (args.compare) {
	const baseline = JSON.parse(readFileSync(args.compare, "utf8"));
	printComparison(baseline, results);
} else {
	printTable(results);
}

// -- helpers --------------------------------------------------------------

function discoverApps() {
	// Ask pnpm which workspaces exist so we respect pnpm-workspace.yaml
	// instead of hand-rolling directory traversal.
	const { stdout } = run("pnpm", ["list", "-r", "--depth", "-1", "--json"], {
		cwd: repoRoot,
		capture: true,
	});
	const workspaces = JSON.parse(stdout);
	return workspaces
		.map((ws) => {
			const pkgPath = join(ws.path, "package.json");
			if (!existsSync(pkgPath)) return null;
			const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
			if (!pkg.scripts?.[script]) return null;
			const configPath = pickWranglerConfig(ws.path);
			if (!configPath) return null;
			return { name: ws.name, dir: ws.path, configPath };
		})
		.filter(Boolean);
}

function pickWranglerConfig(dir) {
	for (const candidate of ["wrangler.jsonc", "wrangler.json", "wrangler.toml", "wrangler.e2e.jsonc"]) {
		if (existsSync(join(dir, candidate))) return candidate;
	}
	return null;
}

function measure(app) {
	const { stdout } = run("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", app.configPath], {
		cwd: app.dir,
		capture: true,
	});
	// wrangler prints e.g. "Total Upload: 1234.56 KiB / gzip: 234.56 KiB"
	const match = stdout.match(/Total Upload:\s*([\d.]+)\s*(\w+)\s*\/\s*gzip:\s*([\d.]+)\s*(\w+)/);
	if (!match) {
		throw new Error(`Could not parse wrangler output:\n${stdout}`);
	}
	return {
		uploadBytes: toBytes(Number(match[1]), match[2]),
		gzipBytes: toBytes(Number(match[3]), match[4]),
		raw: match[0],
	};
}

function toBytes(value, unit) {
	const u = unit.toLowerCase();
	if (u.startsWith("kib")) return value * 1024;
	if (u.startsWith("mib")) return value * 1024 * 1024;
	if (u.startsWith("gib")) return value * 1024 * 1024 * 1024;
	if (u.startsWith("b")) return value;
	throw new Error(`Unknown unit: ${unit}`);
}

function fmt(bytes) {
	if (bytes == null) return "-";
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
	return `${(bytes / 1024).toFixed(2)} KiB`;
}

function fmtDelta(before, after) {
	if (before == null || after == null) return "-";
	const diff = after - before;
	const pct = before === 0 ? 0 : (diff / before) * 100;
	const sign = diff > 0 ? "+" : "";
	return `${sign}${fmt(diff).replace(/^-/, "-")} (${sign}${pct.toFixed(2)}%)`;
}

function printTable(results) {
	console.log("\n" + pad("App", 40) + pad("Upload", 16) + "Gzip");
	console.log("-".repeat(80));
	for (const [name, r] of Object.entries(results)) {
		if (r.error) {
			console.log(pad(name, 40) + `ERROR: ${r.error}`);
		} else {
			console.log(pad(name, 40) + pad(fmt(r.uploadBytes), 16) + fmt(r.gzipBytes));
		}
	}
}

function printComparison(before, after) {
	console.log("\n" + pad("App", 36) + pad("Before", 14) + pad("After", 14) + pad("Δ Upload", 22) + "Δ Gzip");
	console.log("-".repeat(110));
	const names = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const name of names) {
		const b = before[name];
		const a = after[name];
		if (!b || !a || b.error || a.error) {
			console.log(pad(name, 36) + "(missing or errored in one side)");
			continue;
		}
		console.log(
			pad(name, 36) +
				pad(fmt(b.uploadBytes), 14) +
				pad(fmt(a.uploadBytes), 14) +
				pad(fmtDelta(b.uploadBytes, a.uploadBytes), 22) +
				fmtDelta(b.gzipBytes, a.gzipBytes)
		);
	}
}

function pad(s, n) {
	return String(s).padEnd(n);
}

function run(cmd, argv, { cwd, capture = false } = {}) {
	const res = spawnSync(cmd, argv, {
		cwd,
		stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0" },
	});
	if (res.status !== 0) {
		const detail = capture ? `\n${res.stdout}\n${res.stderr}` : "";
		throw new Error(`${cmd} ${argv.join(" ")} exited with ${res.status}${detail}`);
	}
	return { stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function parseArgs(argv) {
	const out = {
		filter: null,
		output: null,
		compare: null,
		skipBuild: false,
		script: "build:worker",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--filter") out.filter = argv[++i].split(",");
		else if (a === "--output") out.output = resolve(argv[++i]);
		else if (a === "--compare") out.compare = resolve(argv[++i]);
		else if (a === "--skip-build") out.skipBuild = true;
		else if (a === "--script") out.script = argv[++i];
		else if (a === "-h" || a === "--help") {
			console.log(
				readFileSync(fileURLToPath(import.meta.url), "utf8")
					.split("\n")
					.slice(1, 15)
					.join("\n")
			);
			process.exit(0);
		} else {
			console.error(`Unknown arg: ${a}`);
			process.exit(1);
		}
	}
	return out;
}
