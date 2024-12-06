import type { AsyncLocalStorage } from "node:async_hooks";

/**
 * Creates a proxy that exposes values from an AsyncLocalStorage store
 *
 * @param als AsyncLocalStorage instance
 */
export function createALSProxy<T>(als: AsyncLocalStorage<T>) {
  return new Proxy(
    {},
    {
      ownKeys: () => Reflect.ownKeys(als.getStore()!),
      getOwnPropertyDescriptor: (_, ...args) => Reflect.getOwnPropertyDescriptor(als.getStore()!, ...args),
      get: (_, property) => Reflect.get(als.getStore()!, property),
      set: (_, property, value) => Reflect.set(als.getStore()!, property, value),
    }
  );
}
