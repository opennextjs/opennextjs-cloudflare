import { FullyCachedComponent, FullyCachedComponentWithTag, ISRComponent } from "@/components/cached";
import { headers } from "next/headers";
import { Suspense } from "react";

export default async function Page() {
	// To opt into SSR
	const _headers = await headers();
	return (
		<div>
			<h1>Cache</h1>
			<p>{_headers.get("accept") ?? "No accept headers"}</p>
			cached:
			<Suspense fallback={<p>Loading...</p>}>
				<FullyCachedComponent />
			</Suspense>
			cached (with tag):
			<Suspense fallback={<p>Loading...</p>}>
				<FullyCachedComponentWithTag />
			</Suspense>
			isr:
			<Suspense fallback={<p>Loading...</p>}>
				<ISRComponent />
			</Suspense>
		</div>
	);
}
