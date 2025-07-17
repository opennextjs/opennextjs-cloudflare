import { Suspense } from "react";

export default function Layout({
	children,
}: Readonly<{
	// For some reason using ReactNode here causes a type error
	children: any;
}>) {
	return (
		<div>
			<Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
		</div>
	);
}
