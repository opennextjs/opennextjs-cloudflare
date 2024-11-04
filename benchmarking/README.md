# Benchmarking

This directory contains a script for running full end to end benchmarks against the example applications.

What the script does:

- takes all the example applications from the [`./examples` directory](../examples/)
  (excluding the ones specified in the `exampleAppsNotToBenchmark` set in [`./src/cloudflare.ts`](./src/cloudflare.ts))
- in parallel for each application:
  - builds the application by running its `build:worker` script
  - deploys the application to production (with `wrangler deploy`)
  - takes the production deployment url
  - benchmarks the application's response time by fetching from the deployment url a number of times

> [!note]
> This is the first cut at benchmarking our solution, later we can take the script in this directory,
> generalize it and make it more reusable if we want
