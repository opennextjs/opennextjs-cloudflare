export function register() {
	// Note: we register instrumentation for both the nodejs and edge runtime, we do that using the NEXT_RUNTIME env
	//       variable as recommended in the official docs:
	// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation#importing-runtime-specific-code

	if (process.env.NEXT_RUNTIME === "nodejs") {
		globalThis["__NODEJS_INSTRUMENTATION_SETUP"] =
			"this value has been set by calling the instrumentation `register` callback in the nodejs runtime";
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		globalThis["__EDGE_INSTRUMENTATION_SETUP"] =
			"this value has been set by calling the instrumentation `register` callback in the edge runtime";
	}
}
