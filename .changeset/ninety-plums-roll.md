---
"@opennextjs/cloudflare": minor
---

Introduce two new entry points to the @opennextjs/cloudflare package, `/cli` and `/lib`. `/cli` is intended to be an entry point for developers looking to use the CLI programmatically, which is a use case especially relevant for using @opennextjs/cloudflare with Workers for Platforms. The new `/lib` entry point is a duplicate of the existing catch-all (`/*`) entry point, but can be used in the future to more explicitly differentiate between exports intended for a Next.js app being deployed to Cloudflare, vs. exports related to programmatic usage of the CLI.
