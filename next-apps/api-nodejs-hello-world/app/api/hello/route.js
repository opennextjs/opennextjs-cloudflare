import { headers } from "next/headers";

export async function GET() {
	// Note: we use headers just so that the route is not built as a static one
	const headersList = headers();
	const sayHi = !!headersList.get("should-say-hi");
	return new Response(sayHi ? "Hi World!" : "Hello World!");
}
