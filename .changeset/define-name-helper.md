---
"@opennextjs/cloudflare": patch
---

fix: define `__name` globally in the worker bundle

Next 15's emitted hydration script calls esbuild's name-preservation helper `__name`. Because the worker bundler did not define this helper, every page logged `ReferenceError: __name is not defined` to the console. The error is caught by the framework's try/catch and is non-fatal, but pollutes Sentry / devtools.

Adds an esbuild `define` block to inline a tiny `__name` polyfill into the bundle, so the helper resolves at runtime regardless of whether the call comes from Next's emitted code or from esbuild's own transformations.

Closes https://github.com/opennextjs/opennextjs-cloudflare/issues/1249
