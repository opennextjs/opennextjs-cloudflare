# Bug Reproduction: Hyphen in Dynamic Route Slug

This example reproduces the bug reported in [issue #822](https://github.com/opennextjs/opennextjs-cloudflare/issues/822).

## Problem

Dynamic routes containing hyphens in the slug (e.g., `[...better-auth]`) cause regex syntax errors when deployed to Cloudflare Workers:

```
Uncaught SyntaxError: Invalid regular expression: /^/(?:)?api/auth/[...better-auth](?:/)?$/: Range out of order in character class
```

## Reproduction

1. This example contains a route at `app/api/auth/[...better-auth]/route.ts`
2. Build with OpenNext Cloudflare
3. Deploy to Cloudflare Workers
4. The error occurs during runtime

## Expected Fix

The hyphen should be properly escaped in the generated regex pattern.