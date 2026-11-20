import { getCloudflareContext } from "@opennextjs/cloudflare";
import { connection } from "next/server";
import { Suspense } from "react";

declare global {
	interface CloudflareEnv {
		UNTRACKED_IO: { fetch(url: string): Promise<Response> };
	}
}

type PageProps = {
	params: Promise<{ slug: string }>;
};

export const unstable_instant = {
	prefetch: "runtime",
	samples: [{ params: { slug: "sample" } }],
	unstable_disableBuildValidation: true,
};

async function CachedShell() {
	"use cache";
	return <p>Cached service binding shell</p>;
}

async function BindingData() {
	if (!("Cloudflare" in globalThis)) {
		// The Node.js build leaves a hole for the binding, which is available in workerd.
		await connection();
		return null;
	}

	const { env } = getCloudflareContext();
	const response = await env.UNTRACKED_IO.fetch("https://untracked-io.invalid/");
	return <p data-testid="service-binding-result">{await response.text()}</p>;
}

async function Slug({ params }: PageProps) {
	const { slug } = await params;
	return <p>Service binding page: {slug}</p>;
}

export default function ServiceBindingPage({ params }: PageProps) {
	return (
		<main>
			<h1>Worker service binding</h1>
			<CachedShell />
			<Suspense fallback={<p>Loading slug...</p>}>
				<Slug params={params} />
			</Suspense>
			<Suspense fallback={<p>Loading service binding...</p>}>
				<BindingData />
			</Suspense>
		</main>
	);
}
