# @opennextjs/cloudflare

## 0.1.1

### Patch Changes

- 66ba0ff: enhancement: Expand missing next.config error message

  Found out that next dev can run the a Next.js app without next.config but
  if we are using the adapter we throw an error if we don't find the config.
  So expanded the error for users.

## 0.1.0

### Minor Changes

- 87f4fb5: feat: configure kv binding name with env var

  The Workers KV binding used in the Next.js cache handler can be given a custom name with the `__OPENNEXT_KV_BINDING_NAME` environment variable at build-time, instead of defaulting to `NEXT_CACHE_WORKERS_KV`.

### Patch Changes

- 83abcfe: refactor: retrieve cache handler kv instance inside constructor

  The cache handler was retrieving it's KV instance as a static property on the class that was defined at some point during the execution of the Next.js server. This moves the retrieval of the KV instance to happen inside the constructor for the class, so that it is retrieved during instantiation instead.

## 0.0.3

### Patch Changes

- a99cd1e: ci: actually publish updates packages to npm

## 0.0.2

### Patch Changes

- ce8a281: ci: first deployment via changesets
