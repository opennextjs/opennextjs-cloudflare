import { describe, expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import {
	signalIdentifierRuleBundled,
	signalIdentifierRuleUnbundled,
	signalSpreadElement,
} from "./patch-from-node-request.js";

describe("fromNodeRequest", () => {
	const codeUnbundled = `
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    NextRequestAdapter: null,
    ResponseAborted: null,
    ResponseAbortedName: null,
    createAbortController: null,
    signalFromNodeResponse: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    NextRequestAdapter: function() {
        return NextRequestAdapter;
    },
    ResponseAborted: function() {
        return ResponseAborted;
    },
    ResponseAbortedName: function() {
        return ResponseAbortedName;
    },
    createAbortController: function() {
        return createAbortController;
    },
    signalFromNodeResponse: function() {
        return signalFromNodeResponse;
    }
});
const _requestmeta = require("../../../request-meta");
const _utils = require("../../utils");
const _request = require("../request");
const _helpers = require("../../../base-http/helpers");
const ResponseAbortedName = 'ResponseAborted';
class ResponseAborted extends Error {
    constructor(...args){
        super(...args), this.name = ResponseAbortedName;
    }
}
function createAbortController(response) {
    const controller = new AbortController();
    response.once('close', ()=>{
        if (response.writableFinished) return;
        controller.abort(new ResponseAborted());
    });
    return controller;
}
function signalFromNodeResponse(response) {
    const { errored, destroyed } = response;
    if (errored || destroyed) {
        return AbortSignal.abort(errored ?? new ResponseAborted());
    }
    const { signal } = createAbortController(response);
    return signal;
}
class NextRequestAdapter {
    static fromBaseNextRequest(request, signal) {
        if (// The type check here ensures that \`req\` is correctly typed, and the
        // environment variable check provides dead code elimination.
        process.env.NEXT_RUNTIME === 'edge' && (0, _helpers.isWebNextRequest)(request)) {
            return NextRequestAdapter.fromWebNextRequest(request);
        } else if (// The type check here ensures that \`req\` is correctly typed, and the
        // environment variable check provides dead code elimination.
        process.env.NEXT_RUNTIME !== 'edge' && (0, _helpers.isNodeNextRequest)(request)) {
            return NextRequestAdapter.fromNodeNextRequest(request, signal);
        } else {
            throw Object.defineProperty(new Error('Invariant: Unsupported NextRequest type'), "__NEXT_ERROR_CODE", {
                value: "E345",
                enumerable: false,
                configurable: true
            });
        }
    }
    static fromNodeNextRequest(request, signal) {
        // HEAD and GET requests can not have a body.
        let body = null;
        if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
            body = request.body;
        }
        let url;
        if (request.url.startsWith('http')) {
            url = new URL(request.url);
        } else {
            // Grab the full URL from the request metadata.
            const base = (0, _requestmeta.getRequestMeta)(request, 'initURL');
            if (!base || !base.startsWith('http')) {
                // Because the URL construction relies on the fact that the URL provided
                // is absolute, we need to provide a base URL. We can't use the request
                // URL because it's relative, so we use a dummy URL instead.
                url = new URL(request.url, 'http://n');
            } else {
                url = new URL(request.url, base);
            }
        }
        return new _request.NextRequest(url, {
            method: request.method,
            headers: (0, _utils.fromNodeOutgoingHttpHeaders)(request.headers),
            duplex: 'half',
            signal,
            // geo
            // ip
            // nextConfig
            // body can not be passed if request was aborted
            // or we get a Request body was disturbed error
            ...request.request.signal.aborted ? {} : {
                body
            }
        });
    }
    static fromWebNextRequest(request) {
        // HEAD and GET requests can not have a body.
        let body = null;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            body = request.body;
        }
        return new _request.NextRequest(request.url, {
            method: request.method,
            headers: (0, _utils.fromNodeOutgoingHttpHeaders)(request.headers),
            duplex: 'half',
            signal: request.request.signal,
            // geo
            // ip
            // nextConfig
            // body can not be passed if request was aborted
            // or we get a Request body was disturbed error
            ...request.request.signal.aborted ? {} : {
                body
            }
        });
    }
}
   `;

	const codeBundled = `class d {
    static fromBaseNextRequest(e2, t2) {
        if ((0, i.isNodeNextRequest)(e2)) return d.fromNodeNextRequest(e2, t2);
        throw Object.defineProperty(Error("Invariant: Unsupported NextRequest type"), "__NEXT_ERROR_CODE", { value: "E345", enumerable: false, configurable: true });
    }
    static fromNodeNextRequest(e2, t2) {
        let r2, i2 = null;
        if ("GET" !== e2.method && "HEAD" !== e2.method && e2.body && (i2 = e2.body), e2.url.startsWith("http")) r2 = new URL(e2.url);
        else {
        let t3 = (0, n.getRequestMeta)(e2, "initURL");
        r2 = t3 && t3.startsWith("http") ? new URL(e2.url, t3) : new URL(e2.url, "http://n");
        }
        return new o.NextRequest(r2, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: t2, ...t2.aborted ? {} : { body: i2 } });
    }
    static fromWebNextRequest(e2) {
        let t2 = null;
        return "GET" !== e2.method && "HEAD" !== e2.method && (t2 = e2.body), new o.NextRequest(e2.url, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: e2.request.signal, ...e2.request.signal.aborted ? {} : { body: t2 } });
    }
}`;
	describe("should patch bundled code", () => {
		test("signal shorthand property identifier", () => {
			expect(computePatchDiff("next-request.js", codeBundled, signalIdentifierRuleBundled))
				.toMatchInlineSnapshot(`
				"Index: next-request.js
				===================================================================
				--- next-request.js
				+++ next-request.js
				@@ -9,9 +9,9 @@
				         else {
				         let t3 = (0, n.getRequestMeta)(e2, "initURL");
				         r2 = t3 && t3.startsWith("http") ? new URL(e2.url, t3) : new URL(e2.url, "http://n");
				         }
				-        return new o.NextRequest(r2, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: t2, ...t2.aborted ? {} : { body: i2 } });
				+        return new o.NextRequest(r2, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: globalThis[Symbol.for("__cloudflare-context__")].abortSignal, ...t2.aborted ? {} : { body: i2 } });
				     }
				     static fromWebNextRequest(e2) {
				         let t2 = null;
				         return "GET" !== e2.method && "HEAD" !== e2.method && (t2 = e2.body), new o.NextRequest(e2.url, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: e2.request.signal, ...e2.request.signal.aborted ? {} : { body: t2 } });
				"
			`);
		});

		test("signal spread element", () => {
			expect(computePatchDiff("next-request.js", codeBundled, signalSpreadElement)).toMatchInlineSnapshot(`
				"Index: next-request.js
				===================================================================
				--- next-request.js
				+++ next-request.js
				@@ -9,9 +9,9 @@
				         else {
				         let t3 = (0, n.getRequestMeta)(e2, "initURL");
				         r2 = t3 && t3.startsWith("http") ? new URL(e2.url, t3) : new URL(e2.url, "http://n");
				         }
				-        return new o.NextRequest(r2, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: t2, ...t2.aborted ? {} : { body: i2 } });
				+        return new o.NextRequest(r2, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: t2, ...globalThis[Symbol.for("__cloudflare-context__")].abortSignal.aborted ? {} : { body: i2 } });
				     }
				     static fromWebNextRequest(e2) {
				         let t2 = null;
				         return "GET" !== e2.method && "HEAD" !== e2.method && (t2 = e2.body), new o.NextRequest(e2.url, { method: e2.method, headers: (0, a.fromNodeOutgoingHttpHeaders)(e2.headers), duplex: "half", signal: e2.request.signal, ...e2.request.signal.aborted ? {} : { body: t2 } });
				"
			`);
		});
	});

	describe("should patch unbundled code", () => {
		test("signal shorthand property identifier", () => {
			expect(computePatchDiff("next-request.js", codeUnbundled, signalIdentifierRuleUnbundled))
				.toMatchInlineSnapshot(`
					"Index: next-request.js
					===================================================================
					--- next-request.js
					+++ next-request.js
					@@ -1,5 +1,4 @@
					-
					 "use strict";
					 Object.defineProperty(exports, "__esModule", {
					     value: true
					 });
					@@ -101,9 +100,9 @@
					         return new _request.NextRequest(url, {
					             method: request.method,
					             headers: (0, _utils.fromNodeOutgoingHttpHeaders)(request.headers),
					             duplex: 'half',
					-            signal,
					+            signal: globalThis[Symbol.for("__cloudflare-context__")].abortSignal,
					             // geo
					             // ip
					             // nextConfig
					             // body can not be passed if request was aborted
					"
				`);
		});

		test("signal spread element", () => {
			expect(computePatchDiff("next-request.js", codeUnbundled, signalSpreadElement)).toMatchInlineSnapshot(`
				"Index: next-request.js
				===================================================================
				--- next-request.js
				+++ next-request.js
				@@ -1,5 +1,4 @@
				-
				 "use strict";
				 Object.defineProperty(exports, "__esModule", {
				     value: true
				 });
				@@ -107,9 +106,9 @@
				             // ip
				             // nextConfig
				             // body can not be passed if request was aborted
				             // or we get a Request body was disturbed error
				-            ...request.request.signal.aborted ? {} : {
				+            ...globalThis[Symbol.for("__cloudflare-context__")].abortSignal.aborted ? {} : {
				                 body
				             }
				         });
				     }
				"
			`);
		});
	});
});
