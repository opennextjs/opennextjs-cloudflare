---
"@opennextjs/cloudflare": patch
---

fix: keep function names in the server bundle

Bundling the server renamed colliding top-level functions (e.g. `io` to `io2`). With Cache Components, React's resume of a prerendered page compares component names with the postponed state written by `next build`, so every resumed page failed with "Expected the resume to render <io> in this slot but instead it rendered <io2>" and fell back to client rendering (React error #419).
