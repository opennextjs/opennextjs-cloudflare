---
"@opennextjs/cloudflare": patch
---

fix: throw `MODULE_NOT_FOUND` from the stub of a missing optional dependency

With React 18, every Pages Router page rendered by the Worker failed with `TypeError: Cannot read properties of undefined (reading 'contexts')`, caused by `Error: Missing optional dependency "react-dom/server.edge"`. React 18 has no `react-dom/server.edge`, and Next.js falls back to `react-dom/server.browser` only when the error carries the `MODULE_NOT_FOUND` code. The stub now sets that code, so the fallback works again.
