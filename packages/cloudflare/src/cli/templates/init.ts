/**
 * Initialization for the workerd runtime.
 *
 * The file must be imported at the top level the worker.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import stream from "node:stream";

// @ts-expect-error: resolved by wrangler build
import * as nextEnvVars from "./next-env.mjs";

const cloudflareContextALS = new AsyncLocalStorage();

// Note: this symbol needs to be kept in sync with `src/api/get-cloudflare-context.ts`
Object.defineProperty(globalThis, Symbol.for("__cloudflare-context__"), {
	get() {
		return cloudflareContextALS.getStore();
	},
});

/**
 * Executes the handler with the Cloudflare context.
 */
export async function runWithCloudflareRequestContext(
	request: Request,
	env: CloudflareEnv,
	ctx: ExecutionContext,
	handler: () => Promise<Response>
): Promise<Response> {
	init(request, env);

	return cloudflareContextALS.run({ env, ctx, cf: request.cf }, handler);
}

let initialized = false;

/**
 * Initializes the runtime on the first call,
 * no-op on subsequent invocations.
 */
function init(request: Request, env: CloudflareEnv) {
	if (initialized) {
		return;
	}
	initialized = true;

	const url = new URL(request.url);

	initRuntime();
	populateProcessEnv(url, env);
}

function initRuntime() {
	// Some packages rely on `process.version` and `process.versions.node` (i.e. Jose@4)
	// TODO: Remove when https://github.com/unjs/unenv/pull/493 is merged
	Object.assign(process, { version: process.version || "v22.14.0" });
	// @ts-expect-error Node type does not match workerd
	Object.assign(process.versions, { node: "22.14.0", ...process.versions });

	globalThis.__dirname ??= "";
	globalThis.__filename ??= "";
	// Some packages rely on `import.meta.url` but it is undefined in workerd
	// For example it causes a bunch of issues, and will make even import crash with payload
	import.meta.url ??= "file:///worker.js";

	// Do not crash on cache not supported
	// https://github.com/cloudflare/workerd/pull/2434
	// compatibility flag "cache_option_enabled" -> does not support "force-cache"
	const __original_fetch = globalThis.fetch;

	globalThis.fetch = (input, init) => {
		if (init) {
			delete (init as { cache: unknown }).cache;
		}
		return __original_fetch(input, init);
	};

	const CustomRequest = class extends globalThis.Request {
		constructor(input: RequestInfo | URL, init?: RequestInit) {
			if (init) {
				delete (init as { cache: unknown }).cache;
				// https://github.com/cloudflare/workerd/issues/2746
				// https://github.com/cloudflare/workerd/issues/3245
				Object.defineProperty(init, "body", {
					// @ts-ignore
					value: init.body instanceof stream.Readable ? ReadableStream.from(init.body) : init.body,
				});
			}
			super(input, init);
		}
	};

	Object.assign(globalThis, {
		Request: CustomRequest,
		__BUILD_TIMESTAMP_MS__,
		__NEXT_BASE_PATH__,
		__ASSETS_RUN_WORKER_FIRST__,
		// The external middleware will use the convertTo function of the `edge` converter
		// by default it will try to fetch the request, but since we are running everything in the same worker
		// we need to use the request as is.
		__dangerous_ON_edge_converter_returns_request: true,
	});
}

/**
 * Populate process.env with:
 * - the environment variables and secrets from the cloudflare platform
 * - the variables from Next .env* files
 * - the origin resolver information
 */
function populateProcessEnv(url: URL, env: CloudflareEnv) {
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === "string") {
			process.env[key] = value;
		}
	}

	const mode = env.NEXTJS_ENV ?? "production";
	if (nextEnvVars[mode]) {
		for (const key in nextEnvVars[mode]) {
			process.env[key] ??= nextEnvVars[mode][key];
		}
	}

	// Set the default Origin for the origin resolver.
	// This is only needed for an external middleware bundle
	process.env.OPEN_NEXT_ORIGIN = JSON.stringify({
		default: {
			host: url.hostname,
			protocol: url.protocol.slice(0, -1),
			port: url.port,
		},
	});

	/* We need to set this environment variable to make redirects work properly in preview mode.
	 * Next sets this in standalone mode during `startServer`. Without this the protocol would always be `https` here:
	 * https://github.com/vercel/next.js/blob/6b1e48080e896e0d44a05fe009cb79d2d3f91774/packages/next/src/server/app-render/action-handler.ts#L307-L316
	 */
	process.env.__NEXT_PRIVATE_ORIGIN = url.origin;

	// `__DEPLOYMENT_ID__` is a string (passed via ESBuild).
	if (__DEPLOYMENT_ID__) {
		process.env.DEPLOYMENT_ID = __DEPLOYMENT_ID__;
	}
}

declare global {
	// Build timestamp
	var __BUILD_TIMESTAMP_MS__: number;
	// Next basePath
	var __NEXT_BASE_PATH__: string;
	// Value of `run_worker_first` for the asset binding
	var __ASSETS_RUN_WORKER_FIRST__: boolean | string[] | undefined;
	// Deployment ID
	var __DEPLOYMENT_ID__: string;
}
