---
"@opennextjs/cloudflare": patch
---

patch `require("react-dom/server.edge")` calls in `pages.runtime.prod.js` so that they are `try-catch`ed
