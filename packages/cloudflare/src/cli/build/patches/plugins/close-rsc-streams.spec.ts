import { describe, expect, test } from "vitest";

import {
	closePageDataStreamRule,
	closePrefetchStreamRule,
	closeRscStreams,
	closeUnclosingStreamRule,
	usesPartialPrerendering,
} from "./close-rsc-streams.js";

// `createUnclosingStream` and its closing twin, from next@16.4.1 `app-page.runtime.prod.js`.
const minifiedRuntime = `function c(e){let t=0;return new ReadableStream({async pull(r){t<e.length&&r.enqueue(e[t++])}})}function d(e){let t=0;return new ReadableStream({async pull(r){t<e.length?r.enqueue(e[t++]):r.close()}})}`;

// `createUnclosingPrefetchStream`, from a next@16.4.1 server chunk (webpack, minified).
const minifiedPrefetchStream = `function F(a){let b=a.getReader();return new ReadableStream({async pull(a){for(;;){let{done:c,value:d}=await b.read();if(!c){a.enqueue(d);continue}return}}})}`;

// `createUnclosingPrefetchStream`, from next@16.4.1 `dist/esm/server/app-render/collect-segment-data.js`.
const prefetchStream = `
function createUnclosingPrefetchStream(originalFlightStream) {
    const reader = originalFlightStream.getReader();
    return new ReadableStream({
        async pull (controller) {
            while(true){
                const { done, value } = await reader.read();
                if (!done) {
                    // Pass to the target stream and keep consuming the Flight response
                    // from the server.
                    controller.enqueue(value);
                    continue;
                }
                // The server stream has closed. Exit, but intentionally do not close
                // the target stream.
                return;
            }
        }
    });
}
`;

// The inline \`pageDataStream\` of \`collectSegmentData\`, from a next@16.4.1 server chunk (webpack, minified).
const minifiedPageDataStream = `if("number"==typeof s){let a=s;q=new ReadableStream({async start(c){c.enqueue(b.subarray(0,a)),await x.promise,c.enqueue(b.subarray(a))}})}else q=F((0,m.streamFromBuffer)(b)),x.resolve(null===s);`;

// The inline `pageDataStream`, from next@16.4.1 `dist/esm/server/app-render/collect-segment-data.js`.
const pageDataStream = `
if (typeof pageShellByteLength === 'number') {
    const prefixLength = pageShellByteLength;
    pageDataStream = new ReadableStream({
        async start (controller) {
            controller.enqueue(fullPageDataBuffer.subarray(0, prefixLength));
            await release.promise;
            controller.enqueue(fullPageDataBuffer.subarray(prefixLength));
        // Intentionally never closed, like createUnclosingPrefetchStream:
        // the page stream may hold references that never resolve (dynamic
        // holes), and Flight errors if the stream closes while any are pending.
        }
    });
}
`;

describe("closeUnclosingStreamRule", () => {
	test("closes createUnclosingStream and leaves its closing twin alone", () => {
		expect(closeRscStreams(minifiedRuntime, [closeUnclosingStreamRule])).toBe(
			`function c(e){let t=0;return new ReadableStream({async pull(r){t < e.length ? r.enqueue(e[t++]) : r.close()}})}function d(e){let t=0;return new ReadableStream({async pull(r){t<e.length?r.enqueue(e[t++]):r.close()}})}`
		);
	});

	test("is a no-op once the stream closes", () => {
		const patched = closeRscStreams(minifiedRuntime, [closeUnclosingStreamRule]);
		expect(closeRscStreams(patched, [closeUnclosingStreamRule])).toBe(patched);
	});

	test("does not match an enqueue outside of a pull", () => {
		const code = `function f(e,r){let t=0;t<e.length&&r.enqueue(e[t++])}`;
		expect(closeRscStreams(code, [closeUnclosingStreamRule])).toBe(code);
	});
});

describe("closePrefetchStreamRule", () => {
	test("closes the minified prefetch stream when the server stream is done", () => {
		expect(closeRscStreams(minifiedPrefetchStream, [closePrefetchStreamRule])).toBe(
			`function F(a){let b=a.getReader();return new ReadableStream({async pull(a){for(;;){let{done:c,value:d}=await b.read();if(!c){a.enqueue(d);continue}a.close();\nreturn;}}})}`
		);
	});

	test("closes the unminified prefetch stream", () => {
		const patched = closeRscStreams(prefetchStream, [closePrefetchStreamRule]);
		expect(patched).toContain(`controller.close();\nreturn;`);
		expect(patched.match(/\.close\(\)/g)).toHaveLength(1);
	});

	test("is a no-op when the stream already closes", () => {
		const code = `function F(a){let b=a.getReader();return new ReadableStream({async pull(a){for(;;){let{done:c,value:d}=await b.read();if(!c){a.enqueue(d);continue}a.close();return}}})}`;
		expect(closeRscStreams(code, [closePrefetchStreamRule])).toBe(code);
	});

	test("does not match a pull that does not read another stream", () => {
		const code = `new ReadableStream({async pull(a){for(;;){if(!q.length){await w();continue}return}}})`;
		expect(closeRscStreams(code, [closePrefetchStreamRule])).toBe(code);
	});
});

describe("closePageDataStreamRule", () => {
	test("closes the minified page data stream after the last chunk", () => {
		expect(closeRscStreams(minifiedPageDataStream, [closePageDataStreamRule])).toBe(
			`if("number"==typeof s){let a=s;q=new ReadableStream({async start(c){c.enqueue(b.subarray(0,a)),await x.promise,(c.enqueue(b.subarray(a)), c.close())}})}else q=F((0,m.streamFromBuffer)(b)),x.resolve(null===s);`
		);
	});

	test("closes the unminified page data stream", () => {
		const patched = closeRscStreams(pageDataStream, [closePageDataStreamRule]);
		expect(patched).toContain(
			`(controller.enqueue(fullPageDataBuffer.subarray(prefixLength)), controller.close());`
		);
		expect(patched).toContain(`controller.enqueue(fullPageDataBuffer.subarray(0, prefixLength));`);
	});

	test("is a no-op when the stream already closes", () => {
		const code = `q=new ReadableStream({async start(c){c.enqueue(b.subarray(0,a)),await x.promise,c.enqueue(b.subarray(a)),c.close()}})`;
		expect(closeRscStreams(code, [closePageDataStreamRule])).toBe(code);
	});
});

describe("closeRscStreams", () => {
	test("returns the code untouched when nothing matches", () => {
		const code = `const stream = new ReadableStream({ start(c) { c.close() } });`;
		expect(closeRscStreams(code, [closePrefetchStreamRule, closePageDataStreamRule])).toBe(code);
	});

	test("patches both chunk streams in one pass", () => {
		const patched = closeRscStreams(`${minifiedPrefetchStream}${minifiedPageDataStream}`, [
			closePrefetchStreamRule,
			closePageDataStreamRule,
		]);
		expect(patched.match(/\.close\(\)/g)).toHaveLength(2);
	});
});

describe("usesPartialPrerendering", () => {
	test.each([
		[{}, false],
		[{ experimental: {} }, false],
		[{ cacheComponents: true }, true],
		[{ experimental: { cacheComponents: true } }, true],
		[{ experimental: { ppr: true } }, true],
		[{ experimental: { ppr: "incremental" } }, true],
		[{ experimental: { dynamicIO: true } }, true],
	])("%j -> %s", (nextConfig, expected) => {
		expect(usesPartialPrerendering(nextConfig as never)).toBe(expected);
	});
});
