import { defineConfig, devices } from "@playwright/test";
import type nodeProcess from "node:process";
import { getAppPort, getInspectorPort, type AppName } from "./apps";

declare const process: typeof nodeProcess;

export function configurePlaywright(
	app: AppName,
	{
		// Do we run on CI?
		isCI = Boolean(process.env.CI),
		// Do we run on workers (`wrangler dev`) or on Node (`next dev`)
		isWorker = true,
		// Tests with multiple browsers
		multipleBrowsers = false,
		// Whether to run tests in single file in parallel
		parallel = true,
	} = {}
) {
	const port = getAppPort(app, { isWorker });
	const inspectorPort = getInspectorPort(app);
	const baseURL = `http://localhost:${port}`;
	let command: string;
	let timeout: number;
	if (isWorker) {
		const env = app === "r2-incremental-cache" ? "--env e2e" : "";
		if (isCI) {
			// Do not build on CI - there is a preceding build step
			command = `pnpm preview:worker -- --port ${port} --inspector-port ${inspectorPort} ${env}`;
			timeout = 800_000;
		} else {
			timeout = 800_000;
			command = `pnpm preview -- --port ${port} --inspector-port ${inspectorPort} ${env}`;
		}
	} else {
		timeout = 100_000;
		command = `pnpm dev --port ${port}`;
	}

	const projects = [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	];
	if (!multipleBrowsers) {
		projects.length = 1;
	}

	/**
	 * See https://playwright.dev/docs/test-configuration.
	 */
	return defineConfig({
		testDir: "./",
		/* ignore runtime specific tests */
		testIgnore: isWorker ? "*next.spec.ts" : "*cloudflare.spec.ts",
		/* Run tests in files in parallel */
		fullyParallel: parallel,
		/* Fail the build on CI if you accidentally left test.only in the source code. */
		forbidOnly: isCI,
		/* Retry on CI only */
		retries: isCI ? 2 : 0,
		/* Opt out of parallel tests on CI. */
		workers: isCI ? 1 : undefined,
		/* Reporter to use. See https://playwright.dev/docs/test-reporters */
		reporter: "html",
		/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
		use: {
			/* Base URL to use in actions like `await page.goto('/')`. */
			baseURL,
			/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
			trace: "on-first-retry",
		},

		projects,

		/* Run your local dev server before starting the tests */
		webServer: {
			command,
			url: baseURL,
			reuseExistingServer: !isCI,
			timeout,
		},
	});
}
