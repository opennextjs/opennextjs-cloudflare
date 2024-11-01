import nodeTimesPromises from "node:timers/promises";
import nodeFsPromises from "node:fs/promises";
import nodePath from "node:path";

export type FetchBenchmark = {
  calls: number[];
  average: number;
};

export type BenchmarkingResults = {
  name: string;
  path: string;
  fetchBenchmark: FetchBenchmark;
}[];

/**
 * Benchmarks the response time of an application end-to-end by:
 *  - building the application
 *  - deploying it
 *  - and fetching from it (multiple times)
 *
 * @param options.build function implementing how the application is to be built
 * @param options.deploy function implementing how the application is deployed (returning the url of the deployment)
 * @param options.fetch function indicating how to fetch from the application (in case a specific route needs to be hit, cookies need to be applied, etc...)
 * @returns the benchmarking results for the application
 */
export async function benchmarkApplicationResponseTime({
  build,
  deploy,
  fetch,
}: {
  build: () => Promise<void>;
  deploy: () => Promise<string>;
  fetch: (deploymentUrl: string) => Promise<Response>;
}): Promise<FetchBenchmark> {
  await build();
  const deploymentUrl = await deploy();
  return benchmarkFetch(deploymentUrl, { fetch });
}

type BenchmarkFetchOptions = {
  numberOfCalls?: number;
  randomDelayMax?: number;
  fetch: (deploymentUrl: string) => Promise<Response>;
};

const defaultOptions: Required<Omit<BenchmarkFetchOptions, "fetch">> = {
  numberOfCalls: 20,
  randomDelayMax: 15_000,
};

/**
 * Benchmarks a fetch operation by running it multiple times and computing the average time (in milliseconds) such fetch operation takes.
 *
 * @param url The url to fetch from
 * @param options options for the benchmarking
 * @returns the computed average alongside all the single call times
 */
async function benchmarkFetch(url: string, options: BenchmarkFetchOptions): Promise<FetchBenchmark> {
  const benchmarkFetchCall = async () => {
    const preTime = performance.now();
    const resp = await options.fetch(url);
    const postTime = performance.now();

    if (!resp.ok) {
      throw new Error(`Error: Failed to fetch from "${url}"`);
    }

    return postTime - preTime;
  };

  const calls = await Promise.all(
    new Array(options?.numberOfCalls ?? defaultOptions.numberOfCalls).fill(null).map(async () => {
      // let's add a random delay before we make the fetch
      await nodeTimesPromises.setTimeout(
        Math.round(Math.random() * (options?.randomDelayMax ?? defaultOptions.randomDelayMax))
      );

      return benchmarkFetchCall();
    })
  );

  const average = calls.reduce((time, sum) => sum + time) / calls.length;

  return {
    calls,
    average,
  };
}

/**
 * Saves benchmarking results in a local json file
 *
 * @param results the benchmarking results to save
 * @returns the path to the created json file
 */
export async function saveResultsToDisk(results: BenchmarkingResults): Promise<string> {
  const date = new Date();

  const fileName = `${date.toISOString().split(".")[0]!.replace("T", "_").replaceAll(":", "-")}.json`;

  const outputFile = nodePath.resolve(`./results/${fileName}`);

  await nodeFsPromises.mkdir(nodePath.dirname(outputFile), { recursive: true });

  const resultStr = JSON.stringify(results, null, 2);
  await nodeFsPromises.writeFile(outputFile, resultStr);

  return outputFile;
}
