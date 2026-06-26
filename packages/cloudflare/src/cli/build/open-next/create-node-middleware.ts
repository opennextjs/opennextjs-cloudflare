import fs from "node:fs";
import path from "node:path";

import { loadFunctionsConfigManifest } from "@opennextjs/aws/adapters/config/util.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";
import logger from "@opennextjs/aws/logger.js";
import { build, type Plugin } from "esbuild";

import { getUnsupportedNodeMiddlewareModuleReason, isNativeNodeAddonSpecifier } from "../utils/middleware.js";

const nodeMiddlewareOutputPath = "middleware/handler.mjs";

type NodeMiddlewareMatcher = {
	regexp: string;
	has?: RouteHas[];
	missing?: RouteHas[];
};

type RouteHas = {
	type: "header" | "cookie" | "query" | "host";
	key?: string;
	value?: string;
};

/**
 * Builds Next.js Node middleware/proxy into the external middleware entry used by the worker template.
 *
 * This path intentionally bypasses the generic OpenNext Node middleware adapter because that adapter
 * pulls in filesystem-backed config loading that is not valid inside workerd.
 */
export async function createCloudflareNodeMiddleware(options: buildHelper.BuildOptions): Promise<void> {
	const middlewarePath = getStandaloneMiddlewarePath(options);
	const matchers = getNodeMiddlewareMatchers(options);
	const outFile = path.join(options.outputDir, nodeMiddlewareOutputPath);

	fs.mkdirSync(path.dirname(outFile), { recursive: true });

	logger.info("Bundling Node.js middleware/proxy for Cloudflare Workers");
	await build({
		stdin: {
			contents: createNodeMiddlewareEntry(middlewarePath, matchers),
			sourcefile: "cloudflare-node-middleware-entry.mjs",
			resolveDir: options.appPath,
			loader: "js",
		},
		outfile: outFile,
		bundle: true,
		format: "esm",
		platform: "node",
		target: "esnext",
		conditions: ["node", "default"],
		mainFields: ["main", "module"],
		external: ["node:*"],
		minify: options.minify,
		sourcemap: options.debug ? "inline" : false,
		sourcesContent: false,
		banner: {
			js: [
				`import { createRequire as __cloudflareCreateRequire } from "node:module";`,
				`const require = __cloudflareCreateRequire(import.meta.url ?? "file:///worker.js");`,
			].join("\n"),
		},
		plugins: [rejectUnsupportedRuntimePlugin(), stubNextNodeEnvPlugin()],
		logLevel: "warning",
	});
}

export function rejectUnsupportedRuntimePlugin(): Plugin {
	return {
		name: "reject-unsupported-node-middleware-runtime",
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) => {
				if (isNextInternalImporter(args.importer)) {
					return undefined;
				}

				const reason = getUnsupportedNodeMiddlewareModuleReason(args.path);
				if (reason) {
					return {
						errors: [
							{
								text: `Node.js middleware/proxy imports unsupported module "${args.path}" (${reason})`,
							},
						],
					};
				}

				if (isNativeNodeAddonSpecifier(args.path)) {
					return {
						errors: [
							{
								text: `Node.js middleware/proxy imports native addon "${args.path}" (native Node addons are not available in Workers)`,
							},
						],
					};
				}

				return undefined;
			});
		},
	};
}

function isNextInternalImporter(importer: string): boolean {
	const normalizedImporter = importer.split(path.sep).join("/");
	return normalizedImporter.includes("/node_modules/next/");
}

function getStandaloneMiddlewarePath(options: buildHelper.BuildOptions): string {
	const standaloneMiddlewarePath = path.join(
		options.appBuildOutputPath,
		".next/standalone",
		buildHelper.getPackagePath(options),
		".next/server/middleware.js"
	);

	if (fs.existsSync(standaloneMiddlewarePath)) {
		return standaloneMiddlewarePath;
	}

	const middlewarePath = path.join(options.appBuildOutputPath, ".next/server/middleware.js");
	if (fs.existsSync(middlewarePath)) {
		return middlewarePath;
	}

	throw new Error(`Unable to find built Node.js middleware at ${standaloneMiddlewarePath}`);
}

function getNodeMiddlewareMatchers(options: buildHelper.BuildOptions): NodeMiddlewareMatcher[] {
	const functionsConfigManifest = loadFunctionsConfigManifest(path.join(options.appBuildOutputPath, ".next"));

	return functionsConfigManifest.functions["/_middleware"]?.matchers ?? [{ regexp: "^.*$" }];
}

function createNodeMiddlewareEntry(middlewarePath: string, matchers: NodeMiddlewareMatcher[]): string {
	return `
import { Buffer } from "node:buffer";
import { AsyncLocalStorage } from "node:async_hooks";

globalThis.Buffer = Buffer;
globalThis.AsyncLocalStorage = AsyncLocalStorage;

const matchers = ${JSON.stringify(matchers)}.map((matcher) => ({
	...matcher,
	regexp: new RegExp(matcher.regexp),
}));
let middlewareModulePromise;

function matches(request) {
	const url = new URL(request.url);
	const query = getQuery(url);

	return matchers.some((matcher) => {
		if (!matcher.regexp.exec(url.pathname)) {
			return false;
		}

		return matchHas(request, query, matcher.has, matcher.missing);
	});
}

function getQuery(url) {
	const query = {};
	for (const [key, value] of url.searchParams) {
		if (query[key] === undefined) {
			query[key] = value;
		} else if (Array.isArray(query[key])) {
			query[key].push(value);
		} else {
			query[key] = [query[key], value];
		}
	}
	return query;
}

function parseCookies(cookieHeader) {
	const cookies = {};
	if (!cookieHeader) {
		return cookies;
	}

	for (const cookie of cookieHeader.split(";")) {
		const separatorIndex = cookie.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}

		const key = cookie.slice(0, separatorIndex).trim();
		const value = cookie.slice(separatorIndex + 1).trim();
		if (!key || cookies[key] !== undefined) {
			continue;
		}

		const unquotedValue = value[0] === '"' ? value.slice(1, -1) : value;
		try {
			cookies[key] = decodeURIComponent(unquotedValue);
		} catch {
			cookies[key] = unquotedValue;
		}
	}

	return cookies;
}

function getHasValue(request, query, hasItem) {
	switch (hasItem.type) {
		case "header":
			return hasItem.key ? request.headers.get(hasItem.key) ?? undefined : undefined;
		case "cookie":
			return hasItem.key ? parseCookies(request.headers.get("cookie"))[hasItem.key] : undefined;
		case "query":
			return hasItem.key ? query[hasItem.key] : undefined;
		case "host":
			return request.headers.get("host")?.split(":", 1)[0].toLowerCase();
		default:
			return undefined;
	}
}

function hasValue(value) {
	return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function hasMatch(request, query, hasItem) {
	const value = getHasValue(request, query, hasItem);
	if (!hasItem.value && hasValue(value)) {
		return true;
	}

	if (!hasValue(value)) {
		return false;
	}

	const matcher = new RegExp(\`^\${hasItem.value}$\`);
	const matchValue = Array.isArray(value) ? value[value.length - 1] : value;
	return Boolean(String(matchValue).match(matcher));
}

function matchHas(request, query, has = [], missing = []) {
	return has.every((item) => hasMatch(request, query, item)) && !missing.some((item) => hasMatch(request, query, item));
}

async function loadMiddlewareModule() {
	middlewareModulePromise ??= import(${JSON.stringify(middlewarePath)}).then((mod) => mod.default ?? mod);
	return middlewareModulePromise;
}

const filteredResponseHeaders = new Set([
	"x-middleware-override-headers",
	"x-middleware-next",
	"x-middleware-rewrite",
	"content-encoding",
]);
const requestHeaderPrefix = "x-middleware-request-";
const responseHeaderPrefix = "x-middleware-response-";

function toNodeHeaders(headers) {
	const nodeHeaders = {};
	headers.forEach((value, key) => {
		nodeHeaders[key] = value;
	});
	return nodeHeaders;
}

function createAdapterRequest(request) {
	return {
		url: request.url,
		headers: toNodeHeaders(request.headers),
		method: request.method,
		body: request.body,
		signal: request.signal,
	};
}

function splitMiddlewareHeaders(response) {
	const requestHeaders = new Headers();
	const responseHeaders = new Headers();
	const overriddenRequestHeaders = response.headers
		.get("x-middleware-override-headers")
		?.split(",")
		.map((key) => key.trim())
		.filter(Boolean);
	response.headers.forEach((value, key) => {
		const lowerKey = key.toLowerCase();
		if (lowerKey.startsWith(requestHeaderPrefix)) {
			requestHeaders.set(key.slice(requestHeaderPrefix.length), value);
			return;
		}
		if (!filteredResponseHeaders.has(lowerKey)) {
			responseHeaders.append(key, value);
		}
	});
	return { overriddenRequestHeaders, requestHeaders, responseHeaders };
}

function createDownstreamRequest(request, response, url) {
	const { overriddenRequestHeaders, requestHeaders, responseHeaders } = splitMiddlewareHeaders(response);
	const headers = new Headers();
	if (overriddenRequestHeaders) {
		for (const key of overriddenRequestHeaders) {
			const value = requestHeaders.get(key);
			if (value !== null) {
				headers.set(key, value);
			}
		}
	} else {
		request.headers.forEach((value, key) => {
			headers.set(key, value);
		});
		requestHeaders.forEach((value, key) => {
			headers.set(key, value);
		});
	}
	responseHeaders.forEach((value, key) => {
		headers.append(responseHeaderPrefix + key, value);
	});
	return new Request(url, {
		body: request.body,
		headers,
		method: request.method,
		redirect: request.redirect,
	});
}

function createDirectResponse(response) {
	const { responseHeaders } = splitMiddlewareHeaders(response);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}

export async function handler(request, _env, ctx) {
	if (!matches(request)) {
		return request;
	}

	const mod = await loadMiddlewareModule();
	const adapterFn = mod.default || mod;
	const adapterRequest = request.clone();
	const result = await adapterFn({
		handler: mod.middleware || mod,
		request: createAdapterRequest(adapterRequest),
		page: "middleware",
	});

	if (result.waitUntil) {
		ctx.waitUntil(result.waitUntil);
	}

	const response = result.response;
	const rewriteUrl = response.headers.get("x-middleware-rewrite");
	if (rewriteUrl || response.headers.get("x-middleware-next")) {
		return createDownstreamRequest(request, response, rewriteUrl || request.url);
	}

	return createDirectResponse(response);
}
`;
}

function stubNextNodeEnvPlugin(): Plugin {
	return {
		name: "stub-next-node-env",
		setup(build) {
			build.onResolve({ filter: /next\/dist\/build\/adapter\/setup-node-env\.external(\.js)?$/ }, (args) => ({
				path: args.path,
				namespace: "stub-next-node-env",
			}));
			build.onLoad({ filter: /.*/, namespace: "stub-next-node-env" }, () => ({
				contents: "export {};",
				loader: "js",
			}));
		},
	};
}
