import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEPLOYMENT_MAPPING_ENV_NAME, maybeGetSkewProtectionResponse } from "./skew-protection.js";

const CURRENT_DEPLOYMENT_ID = "current-deployment";
const OLDER_DEPLOYMENT_ID = "older-deployment";
const OLDER_VERSION_ID = "9b0b8f8c-1234-5678-9abc-def012345678";
const PREVIEW_HOST = "9b0b8f8c-my-worker.my-subdomain.workers.dev";

const getFetchedRequest = () => {
	const fetchMock = vi.mocked(globalThis.fetch);
	expect(fetchMock).toHaveBeenCalledOnce();
	const [request, init] = fetchMock.mock.calls[0]!;
	return { request: request as Request, headers: new Headers((init as RequestInit).headers) };
};

const requestOlderDeployment = (url: string, init?: RequestInit) =>
	maybeGetSkewProtectionResponse(
		new Request(url, {
			...init,
			headers: { "x-deployment-id": OLDER_DEPLOYMENT_ID, ...init?.headers },
		})
	);

describe("maybeGetSkewProtectionResponse", () => {
	beforeEach(() => {
		vi.stubGlobal("__SKEW_PROTECTION_ENABLED__", true);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("ok"))
		);
		vi.stubEnv("DEPLOYMENT_ID", CURRENT_DEPLOYMENT_ID);
		vi.stubEnv("CF_WORKER_NAME", "my-worker");
		vi.stubEnv("CF_PREVIEW_DOMAIN", "my-subdomain");
		vi.stubEnv(
			DEPLOYMENT_MAPPING_ENV_NAME,
			JSON.stringify({ [OLDER_DEPLOYMENT_ID]: OLDER_VERSION_ID, [CURRENT_DEPLOYMENT_ID]: "current" })
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("routes a request for an older deployment to that version's preview URL", async () => {
		await requestOlderDeployment("https://example.com/dashboard");

		expect(getFetchedRequest().request.url).toBe(`https://${PREVIEW_HOST}/dashboard`);
	});

	it("forwards the requested host so the older deployment can recover it", async () => {
		await requestOlderDeployment("https://example.com/dashboard");

		expect(getFetchedRequest().headers.get("x-forwarded-host")).toBe("example.com");
	});

	it("keeps the port of the requested host", async () => {
		await requestOlderDeployment("https://example.com:8443/dashboard");

		expect(getFetchedRequest().headers.get("x-forwarded-host")).toBe("example.com:8443");
	});

	it("overwrites a client-supplied x-forwarded-host", async () => {
		await requestOlderDeployment("https://example.com/dashboard", {
			headers: { "x-forwarded-host": "attacker.example" },
		});

		expect(getFetchedRequest().headers.get("x-forwarded-host")).toBe("example.com");
	});

	it("still drops the origin header", async () => {
		await requestOlderDeployment("https://example.com/action", {
			method: "POST",
			headers: { origin: "https://example.com" },
		});

		expect(getFetchedRequest().headers.get("origin")).toBeNull();
	});

	it.each([
		["the current deployment is requested", CURRENT_DEPLOYMENT_ID],
		["the deployment is unknown", "never-deployed"],
	])("returns undefined when %s", (_, deploymentId) => {
		const response = maybeGetSkewProtectionResponse(
			new Request("https://example.com/dashboard", { headers: { "x-deployment-id": deploymentId } })
		);

		expect(response).toBeUndefined();
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("returns undefined when no deployment is requested", () => {
		expect(maybeGetSkewProtectionResponse(new Request("https://example.com/dashboard"))).toBeUndefined();
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it.each(["http://localhost:3000/dashboard", `https://${PREVIEW_HOST}/dashboard`])(
		"returns undefined for %s",
		(url) => {
			expect(requestOlderDeployment(url)).toBeUndefined();
			expect(globalThis.fetch).not.toHaveBeenCalled();
		}
	);

	it("reads the requested deployment from the dpl search param", async () => {
		await maybeGetSkewProtectionResponse(
			new Request(`https://example.com/_next/static/chunk.js?dpl=${OLDER_DEPLOYMENT_ID}`)
		);

		const { request, headers } = getFetchedRequest();
		expect(request.url).toBe(`https://${PREVIEW_HOST}/_next/static/chunk.js?dpl=${OLDER_DEPLOYMENT_ID}`);
		expect(headers.get("x-forwarded-host")).toBe("example.com");
	});
});
