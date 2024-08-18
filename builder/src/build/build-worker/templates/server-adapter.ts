import { createMainHandler } from "./core/createMainHandler";

// Because next is messing with fetch, we have to make sure that we use an untouched version of fetch
declare global {
  var internalFetch: typeof fetch;
}
globalThis.internalFetch = fetch;

export const handler = await createMainHandler();
