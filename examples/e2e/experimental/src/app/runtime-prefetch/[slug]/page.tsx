import { headers } from "next/headers";
import { setTimeout } from "node:timers/promises";
import { Suspense } from "react";

type PageProps = {
	params: Promise<{ slug: string }>;
};

/**
 * A runtime prefetch renders the cached shell and the request content in stages, then stops the
 * render. Content that React has not flushed when a stage ends is dropped, so this route shows a
 * stage boundary that lands too early.
 */
export const unstable_instant = {
	prefetch: "runtime",
	samples: [{ params: { slug: "sample" }, headers: [["x-session", "sample"]] }],
	// Build time validation renders the page in a worker, which is not what this fixture exercises.
	unstable_disableBuildValidation: true,
};

async function getShellLabel() {
	"use cache";
	return "Runtime shell";
}

async function RuntimeShell() {
	const label = await getShellLabel();

	return <p data-testid="runtime-shell">{label}</p>;
}

async function RuntimeSession() {
	const requestHeaders = await headers();

	return <p data-testid="runtime-session">Runtime session: {requestHeaders.get("x-session") ?? "none"}</p>;
}

/** Stands for uncached I/O: a runtime prefetch must not contain it. */
async function RuntimeDynamic({ params }: PageProps) {
	const [{ slug }] = await Promise.all([params, headers()]);
	await setTimeout(200);

	return <p data-testid="runtime-dynamic">Runtime dynamic: {slug}</p>;
}

export default async function RuntimePrefetchPage({ params }: PageProps) {
	await Promise.resolve();

	return (
		<main>
			<RuntimeShell />
			<Suspense fallback={<p data-testid="runtime-session-fallback">Loading runtime session...</p>}>
				<RuntimeSession />
			</Suspense>
			<Suspense fallback={<p data-testid="runtime-fallback">Loading runtime dynamic...</p>}>
				<RuntimeDynamic params={params} />
			</Suspense>
		</main>
	);
}
