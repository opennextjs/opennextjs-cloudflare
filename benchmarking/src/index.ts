import nodeTimesPromises from "node:timers/promises";
import * as cloudflare from "./cloudflare";
import { benchmarkApplicationResponseTime, BenchmarkingResults, saveResultsToDisk } from "./benchmarking";
import { runOperationsWithSpinner } from "./utils";

const appPathsToBenchmark = await cloudflare.collectAppPathsToBenchmark();

const benchmarkingResults: BenchmarkingResults = await runOperationsWithSpinner(
  "Benchmarking Apps",
  appPathsToBenchmark.map(({ name, path }, i) => async () => {
    await nodeTimesPromises.setTimeout(i * 1_000);
    const fetchBenchmark = await benchmarkApplicationResponseTime({
      build: async () => cloudflare.buildApp(path),
      deploy: async () => cloudflare.deployBuiltApp(path),
      fetch,
    });

    return {
      name,
      path,
      fetchBenchmark,
    };
  })
);

console.log();

const outputFile = await saveResultsToDisk(benchmarkingResults);

console.log(`The benchmarking results have been written in ${outputFile}`);

console.log("\n\nSummary: ");
const summary = benchmarkingResults.map(({ name, fetchBenchmark }) => ({
  name,
  "average fetch duration (ms)": Math.round(fetchBenchmark.averageMs),
}));
console.table(summary);

console.log();

process.exit(0);
