import type { ContentUpdater, Plugin } from "@opennextjs/aws/plugins/content-updater.js";

export function fixRequire(updater: ContentUpdater): Plugin {
	return updater.updateContent("fix-require", [
		{
			field: {
				filter: /\.(js|mjs|cjs|jsx|ts|tsx)$/,
				contentFilter: /.*/,
				callback: ({ contents }) => {
					// `eval(...)` is not supported by workerd.
					contents = contents.replaceAll(`eval("require")`, "require");

					// `@opentelemetry` has a few issues.
					//
					// Next.js has the following code in `next/dist/server/lib/trace/tracer.js`:
					//
					//     try {
					//       api = require('@opentelemetry/api');
					//     } catch (err) {
					//       api = require('next/dist/compiled/@opentelemetry/api');
					//     }
					//
					// The intent is to allow users to install their own version of `@opentelemetry/api`.
					//
					// The problem is that even when users do not explicitly install `@opentelemetry/api`,
					// `require('@opentelemetry/api')` resolves to the package which is a dependency
					// of Next.
					//
					// The second problem is that when Next traces files, it would not copy the `api/build/esm`
					// folder (used by the `module` conditions in package.json) it would only copy `api/build/src`.
					// This could be solved by updating the next config:
					//
					//     const nextConfig: NextConfig = {
					//       // ...
					//       outputFileTracingIncludes: {
					//         "*": ["./node_modules/@opentelemetry/api/build/**/*"],
					//       },
					//     };
					//
					// We can consider doing that when we want to enable users to install their own version
					// of `@opentelemetry/api`. For now we simply use the pre-compiled version.
					contents = contents.replace(
						/require\(.@opentelemetry\/api.\)/g,
						`require("next/dist/compiled/@opentelemetry/api")`
					);

					return contents;
				},
			},
		},
	]);
}
