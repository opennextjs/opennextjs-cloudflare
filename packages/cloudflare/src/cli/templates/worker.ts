import type { ExportedHandler, Fetcher } from "@cloudflare/workers-types";
import { NodeNextRequest, NodeNextResponse } from "next/dist/server/base-http/node";
import { AsyncLocalStorage } from "node:async_hooks";
import type { CloudflareContext } from "../../api";
import type { IncomingMessage } from "node:http";
import { MockedResponse } from "next/dist/server/lib/mock-request";
import type { NextConfig } from "next";
import type { NodeRequestHandler } from "next/dist/server/next-server";
import Stream from "node:stream";

const NON_BODY_RESPONSES = new Set([101, 204, 205, 304]);

const cloudflareContextALS = new AsyncLocalStorage<CloudflareContext>();

// Note: this symbol needs to be kept in sync with the one defined in `src/api/get-cloudflare-context.ts`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any)[Symbol.for("__cloudflare-context__")] = new Proxy(
  {},
  {
    ownKeys: () => Reflect.ownKeys(cloudflareContextALS.getStore()!),
    getOwnPropertyDescriptor: (_, ...args) =>
      Reflect.getOwnPropertyDescriptor(cloudflareContextALS.getStore()!, ...args),
    get: (_, property) => Reflect.get(cloudflareContextALS.getStore()!, property),
    set: (_, property, value) => Reflect.set(cloudflareContextALS.getStore()!, property, value),
  }
);

// Injected at build time
const nextConfig: NextConfig = JSON.parse(process.env.__NEXT_PRIVATE_STANDALONE_CONFIG ?? "{}");

let requestHandler: NodeRequestHandler | null = null;

export default {
  async fetch(request, env, ctx) {
    return cloudflareContextALS.run({ env, ctx, cf: request.cf }, async () => {
      if (requestHandler == null) {
        globalThis.process.env = { ...globalThis.process.env, ...env };
        // Note: "next/dist/server/next-server" is a cjs module so we have to `require` it not to confuse esbuild
        //       (since esbuild can run in projects with different module resolutions)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NextNodeServer = require("next/dist/server/next-server")
          .default as typeof import("next/dist/server/next-server").default;

        requestHandler = new NextNodeServer({
          conf: nextConfig,
          customServer: false,
          dev: false,
          dir: "",
          minimalMode: false,
        }).getRequestHandler();
      }

      const url = new URL(request.url);

      if (url.pathname === "/_next/image") {
        const imageUrl =
          url.searchParams.get("url") ?? "https://developers.cloudflare.com/_astro/logo.BU9hiExz.svg";
        if (imageUrl.startsWith("/")) {
          return env.ASSETS.fetch(new URL(imageUrl, request.url));
        }
        return fetch(imageUrl, { cf: { cacheEverything: true } });
      }

      const { req, res, webResponse } = getWrappedStreams(request, ctx);

      ctx.waitUntil(Promise.resolve(requestHandler(new NodeNextRequest(req), new NodeNextResponse(res))));

      return await webResponse();
    });
  },
} as ExportedHandler<{ ASSETS: Fetcher }>;

function getWrappedStreams(request: Request, ctx: ExecutionContext) {
  const url = new URL(request.url);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqBody = request.body && Stream.Readable.fromWeb(request.body as any);
  const req = (reqBody ?? Stream.Readable.from([])) as IncomingMessage;
  req.httpVersion = "1.0";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 0;
  req.url = url.href.slice(url.origin.length);
  req.headers = Object.fromEntries([...request.headers]);
  req.method = request.method;
  Object.defineProperty(req, "__node_stream__", {
    value: true,
    writable: false,
  });
  Object.defineProperty(req, "headersDistinct", {
    get() {
      const headers: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        headers[key] = Array.isArray(value) ? value : [value];
      }
      return headers;
    },
  });

  const { readable, writable } = new IdentityTransformStream();
  const resBodyWriter = writable.getWriter();

  const res = new MockedResponse({
    resWriter: (chunk) => {
      resBodyWriter.write(typeof chunk === "string" ? Buffer.from(chunk) : chunk).catch((err) => {
        if (
          err.message.includes("WritableStream has been closed") ||
          err.message.includes("Network connection lost")
        ) {
          // safe to ignore
          return;
        }
        console.error("Error in resBodyWriter.write");
        console.error(err);
      });
      return true;
    },
  });

  // It's implemented as a no-op, but really it should mark the headers as done
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.flushHeaders = () => (res as any).headPromiseResolve();

  // Only allow statusCode to be modified if not sent
  let { statusCode } = res;
  Object.defineProperty(res, "statusCode", {
    get: function () {
      return statusCode;
    },
    set: function (val) {
      if (this.finished || this.headersSent) {
        return;
      }
      statusCode = val;
    },
  });

  // Make sure the writer is eventually closed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.waitUntil((res as any).hasStreamed.finally(() => resBodyWriter.close().catch(() => {})));

  return {
    res,
    req,
    webResponse: async () => {
      await res.headPromise;
      // TODO: remove this once streaming with compression is working nicely
      res.setHeader("content-encoding", "identity");
      return new Response(NON_BODY_RESPONSES.has(res.statusCode) ? null : readable, {
        status: res.statusCode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        headers: (res as any).headers,
      });
    },
  };
}
