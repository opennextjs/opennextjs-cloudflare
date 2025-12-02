import { headers } from "next/headers";

export default async function MiddlewarePage() {
	const cloudflareContextHeader = (await headers()).get("x-cloudflare-context");

	return (
		<>
			<h1>Via middleware</h1>
			<p>
				The value of the <i>x-cloudflare-context</i> header is: <br />
				<span
					style={{
						display: "inline-block",
						margin: "1rem 2rem",
						color: "grey",
						fontSize: "1.2rem",
					}}
					data-testid="cloudflare-context-header"
				>
					{cloudflareContextHeader}
				</span>
			</p>
		</>
	);
}
