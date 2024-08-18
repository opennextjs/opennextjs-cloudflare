import type { AsyncLocalStorage } from "node:async_hooks";

import { openNextHandler } from "./requestHandler";
import converter from "./converter.js";

declare global {
  var serverId: string;
  var __als: AsyncLocalStorage<{
    requestId: string;
    pendingPromiseRunner: any;
  }>;
}

function generateUniqueId() {
  return crypto.randomUUID();
}

export async function createMainHandler() {
  globalThis.serverId = generateUniqueId();

  return async (
    event: Request,
    env: Record<string, string>
  ): Promise<Response> => {
    const internalEvent = await converter.convertFrom(event);

    const response = await openNextHandler(internalEvent);

    const result: Response = await converter.convertTo(response);

    return result;
  };
}
