import { redirect } from "next/navigation";

import Client from "./client";

// For: serverActions.test.ts, a native form that must work without JavaScript
/**
 * Redirects a native form submission to the search-query fixture.
 *
 * @param formData Submitted query data.
 * @returns This action does not return because it redirects.
 * @throws Always throws the Next.js redirect signal.
 */
async function search(formData: FormData): Promise<never> {
	"use server";
	const query = encodeURIComponent(String(formData.get("query")));
	redirect(`/search-query?searchParams=${query}`);
}

export default function Page() {
	return (
		<div>
			<h1>Server Actions</h1>
			<Client />
			<form action={search}>
				<input name="query" aria-label="Query" />
				<button type="submit">Submit Form Action</button>
			</form>
		</div>
	);
}
