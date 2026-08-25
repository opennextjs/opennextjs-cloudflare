import { headers } from "next/headers";
import { setTimeout } from "node:timers/promises";
import { Suspense } from "react";

type PageProps = {
	params: Promise<{ slug: string }>;
};

/**
 * A runtime prefetch renders the shell and the session content in a five task pipeline and aborts
 * right after the last task, so anything React has not flushed by then is dropped and the client
 * receives only the one byte partial marker. It is the strictest user of Next's staged scheduler.
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

async function RuntimeDynamic({ params }: PageProps) {
	const [{ slug }] = await Promise.all([params, headers()]);
	await setTimeout(50);

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
