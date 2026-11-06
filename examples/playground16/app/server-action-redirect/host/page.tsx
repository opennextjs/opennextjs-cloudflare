import { headers } from "next/headers";

// For: server-action-redirect.cloudflare.spec.ts, the target of a server action redirect rendered for the host of the request
export default async function Page() {
	const host = (await headers()).get("host");

	return <div>Rendered for host: {host}</div>;
}
