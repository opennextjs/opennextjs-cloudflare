import type { InferGetServerSidePropsType } from "next";

/**
 * `getServerSideProps` runs on every request (unlike `getStaticProps` with `fallback: false`,
 * which resolves `notFound` at build time). This makes it possible for this route to be the
 * very first request handled by a fresh Worker isolate, which is what regresses if
 * `routerServerContext.render404` isn't registered before the first request.
 *
 * See e2e/ssr-not-found.test.ts's "should render the app's 404 page for a getServerSideProps
 * `notFound` result, not a bare fallback body" test.
 */
export async function getServerSideProps() {
	return { notFound: true };
}

export default function Page({}: InferGetServerSidePropsType<typeof getServerSideProps>) {
	return null;
}
