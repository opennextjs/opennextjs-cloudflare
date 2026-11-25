import { redirect } from "next/navigation";

// For: server-action-redirect.cloudflare.spec.ts
/**
 * Redirects to the page that renders the host of the request.
 *
 * Next renders the target of a relative redirect through a subrequest and streams it in the action response.
 *
 * @returns This action does not return because it redirects.
 * @throws Always throws the Next.js redirect signal.
 */
async function redirectToHost(): Promise<never> {
	"use server";
	redirect("/server-action-redirect/host");
}

export default function Page() {
	return (
		<form action={redirectToHost}>
			<button type="submit">Redirect To Host</button>
		</form>
	);
}
