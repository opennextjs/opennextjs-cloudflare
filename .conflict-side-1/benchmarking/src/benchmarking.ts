import nodeTimesPromises from "node:timers/promises";
import nodeFsPromises from "node:fs/promises";
import nodePath from "node:path";
import { getPercentile } from "./utils";

export type FetchBenchmark = {
	iterationsMs: number[];
	averageMs: number;
	p90Ms: number;
};

export type BenchmarkingResults = {
	name: string;
	path: string;
	fetchBenchmark: FetchBenchmark;
}[];

type BenchmarkFetchOptions = {
	numberOfIterations?: number;
	maxRandomDelayMs?: number;
	fetch: (deploymentUrl: string) => Promise<Response>;
};

const defaultOptions: Required<Omit<BenchmarkFetchOptions, "fetch">> = {
	numberOfIterations: 20,
	maxRandomDelayMs: 15_000,
};

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

/**
 * Benchmarks a fetch operation by running it multiple times and computing the average time (in milliseconds) such fetch operation takes.
 *
 * @param url The url to fetch from
 * @param options options for the benchmarking
 * @returns the computed average alongside all the single call times
 */
async function benchmarkFetch(url: string, options: BenchmarkFetchOptions): Promise<FetchBenchmark> {
	const benchmarkFetchCall = async () => {
		const preTimeMs = performance.now();
		const resp = await options.fetch(url);
		const postTimeMs = performance.now();

		if (!resp.ok) {
			throw new Error(`Error: Failed to fetch from "${url}"`);
		}

		return postTimeMs - preTimeMs;
	};

	const resolvedOptions = { ...defaultOptions, ...options };

	const iterationsMs = await Promise.all(
		new Array(resolvedOptions.numberOfIterations).fill(null).map(async () => {
			// let's add a random delay before we make the fetch
			await nodeTimesPromises.setTimeout(Math.round(Math.random() * resolvedOptions.maxRandomDelayMs));

			return benchmarkFetchCall();
		})
	);

	const averageMs = iterationsMs.reduce((time, sum) => sum + time) / iterationsMs.length;

	const p90Ms = getPercentile(iterationsMs, 90);

	return {
		iterationsMs,
		averageMs,
		p90Ms,
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

	const fileName = `${toSimpleDateString(date)}.json`;

	const outputFile = nodePath.resolve(`./results/${fileName}`);

	await nodeFsPromises.mkdir(nodePath.dirname(outputFile), { recursive: true });

	const resultStr = JSON.stringify(results, null, 2);
	await nodeFsPromises.writeFile(outputFile, resultStr);

	return outputFile;
}

/**
 * Takes a date and coverts it to a simple format that can be used as
 * a filename (which is human readable and doesn't contain special
 * characters)
 *
 * The format being: `YYYY-MM-DD_hh-mm-ss`
 *
 * @param date the date to convert
 * @returns a string representing the date
 */
function toSimpleDateString(date: Date): string {
	const isoString = date.toISOString();
	const isoDate = isoString.split(".")[0]!;

	return isoDate.replace("T", "_").replaceAll(":", "-");
}
