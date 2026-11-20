import openNextWorker from "./.open-next/worker.js";

export * from "./.open-next/worker.js";

let executions = 0;

export default {
	fetch(request, env, ctx) {
		// The self binding dispatches a separate workerd request within the fixture.
		if (request.url === "https://untracked-io.invalid/") {
			return new Response(`service-binding-value-${++executions}`);
		}

		return openNextWorker.fetch(request, env, ctx);
	},
};
