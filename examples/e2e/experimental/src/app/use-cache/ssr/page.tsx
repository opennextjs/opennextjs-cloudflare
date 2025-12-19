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
			<h2>cached:</h2>
			<Suspense fallback={<p>Loading...</p>}>
				<FullyCachedComponent />
			</Suspense>
			<h2>cached (with tag):</h2>
			<Suspense fallback={<p>Loading...</p>}>
				<FullyCachedComponentWithTag />
			</Suspense>
			<h2>isr:</h2>
			<Suspense fallback={<p>Loading...</p>}>
				<ISRComponent />
			</Suspense>
		</div>
	);
}
