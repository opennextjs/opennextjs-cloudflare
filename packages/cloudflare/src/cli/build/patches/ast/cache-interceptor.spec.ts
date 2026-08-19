import { readFileSync } from "node:fs";

import mockFs from "mock-fs";
import { afterEach, describe, expect, test } from "vitest";

import { patchCacheInterceptor, patchCacheInterceptorSource } from "./cache-interceptor.js";

const cacheInterceptorSource = `
function getBodyForAppRouter(event, cachedValue) {
  const segmentHeader = \`\${event.headers[NEXT_SEGMENT_PREFETCH_HEADER]}\`;
  const isSegmentResponse =
    Boolean(segmentHeader) &&
    segmentHeader in (cachedValue.segmentData || {}) &&
    !NextConfig.experimental?.prefetchInlining;
  const body = isSegmentResponse
    ? cachedValue.segmentData[segmentHeader]
    : cachedValue.rsc;
  return { body };
}
`;

describe("patchCacheInterceptor", () => {
	afterEach(() => mockFs.restore());

	test("patches the generated middleware", () => {
		const outputDir = "/app/.open-next";
		const middlewarePath = `${outputDir}/middleware/handler.mjs`;
		mockFs({ [middlewarePath]: cacheInterceptorSource });

		patchCacheInterceptor({ outputDir });

		expect(readFileSync(middlewarePath, "utf8")).not.toContain("!NextConfig.experimental?.prefetchInlining");
	});

	test("serves cached segment data when prefetch inlining is enabled", () => {
		const patchedSource = patchCacheInterceptorSource(cacheInterceptorSource);

		expect(patchedSource).toContain(
			"Boolean(segmentHeader) && segmentHeader in (cachedValue.segmentData || {})"
		);
		expect(patchedSource).not.toContain("!NextConfig.experimental?.prefetchInlining");
	});

	test("fails when the upstream cache interceptor no longer matches", () => {
		expect(() => patchCacheInterceptorSource("const isSegmentResponse = false;")).toThrow(
			"Failed to patch the OpenNext cache interceptor"
		);
	});
});
