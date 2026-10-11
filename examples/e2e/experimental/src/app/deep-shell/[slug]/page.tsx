import { headers } from "next/headers";
import { setImmediate, setTimeout } from "node:timers/promises";
import { Suspense } from "react";

type PageProps = { params: Promise<{ slug: string }> };

export const unstable_instant = {
	prefetch: "runtime",
	samples: [{ params: { slug: "sample" }, headers: [["x-session", "sample"]] }],
	unstable_disableBuildValidation: true,
};

/**
 * Each level awaits many times before it renders. React then schedules its work long after the
 * stage started, which is where a stage boundary that lands too early loses content.
 */
async function Level({ depth }: { depth: number }) {
	for (let i = 0; i < 12; i++) await Promise.resolve();
	const label = `level ${depth}`;

	if (depth === 0) return <p data-testid="deep-leaf">Deep leaf {label}</p>;
	return (
		<div data-level={depth}>
			<span>{label}</span>
			<Level depth={depth - 1} />
		</div>
	);
}

async function DeepSession() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
	const requestHeaders = await headers();
	// The promise API of `setImmediate` must stay inside the stage, as the callback API does.
	await setImmediate();
	for (let i = 0; i < 8; i++) await Promise.resolve();

	return <p data-testid="deep-session">Deep session: {requestHeaders.get("x-session") ?? "none"}</p>;
}

/** Stands for uncached I/O: a runtime prefetch must not contain it. */
async function DeepDynamic({ params }: PageProps) {
	const [{ slug }] = await Promise.all([params, headers()]);
	await setTimeout(200);

	return <p data-testid="deep-dynamic">Deep dynamic: {slug}</p>;
}

export default async function DeepShellPage({ params }: PageProps) {
	for (let i = 0; i < 4; i++) await Promise.resolve();

	return (
		<main>
			<p data-testid="deep-shell">Deep shell</p>
			<Level depth={8} />
			<Suspense fallback={<p data-testid="deep-session-fallback">Loading deep session...</p>}>
				<DeepSession />
			</Suspense>
			<Suspense fallback={<p data-testid="deep-fallback">Loading deep dynamic...</p>}>
				<DeepDynamic params={params} />
			</Suspense>
		</main>
	);
}
