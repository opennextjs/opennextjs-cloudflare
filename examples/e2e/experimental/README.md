# Experimental

This project is meant to test experimental features that are only available on canary builds of Next.js.

## Next.js version

This test fixture is intentionally pinned to Next.js 16.2.11 because Cache Components deadlock on Workers
with Next.js 16.3.x. Version 16.2.11 is affected by
[GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), so this fixture
must not be deployed or used as an application template.
