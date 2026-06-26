---
"@opennextjs/cloudflare": patch
---

feature: support Workers-compatible Next.js Node middleware.

The Cloudflare adapter now builds Node middleware through a workerd-compatible external middleware bundle, validates unsupported Node/runtime features before packaging, supports `config.matcher` `has` / `missing` predicates, and covers redirects, rewrites, cookies, headers, request header overrides, matcher predicates, and direct responses in the experimental e2e fixture.
