export function register() {
	// Note: we register instrumentation for both the nodejs and edge runtime, we do that using the NEXT_RUNTIME env
	//       variable as recommended in the official docs:
	//         https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation#importing-runtime-specific-code

	const timeout = setTimeout(() => {
		console.log("This is a delayed log from the instrumentation register callback");
	}, 0);

	if (process.env.NEXT_RUNTIME === "nodejs") {
		globalThis["__NODEJS_INSTRUMENTATION_SETUP"] =
			"this value has been set by calling the instrumentation `register` callback in the nodejs runtime";
		// This is to test that we have access to the node version of setTimeout
		timeout.unref();
		clearTimeout(timeout);
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		globalThis["__EDGE_INSTRUMENTATION_SETUP"] =
			"this value has been set by calling the instrumentation `register` callback in the edge runtime";
	}
}
