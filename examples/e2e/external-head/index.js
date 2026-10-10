"use strict";

// This package mimics dependencies such as `next-seo` that render `<Head>` from `next/head`.
//
// It is plain CommonJS and is not listed in `transpilePackages`. The consuming app installs it
// with `injected: true` so that it lives under `node_modules/`. Together this makes Next.js keep
// it external for the Pages Router: `next/head` is then loaded at runtime from
// `next/dist/shared/lib/head.js`, which requires `./head-manager-context.shared-runtime`.
const { createElement } = require("react");
const Head = require("next/head").default;

function ExternalHead({ title, description }) {
	return createElement(
		Head,
		null,
		createElement("title", null, title),
		createElement("meta", { name: "description", content: description })
	);
}

module.exports = { ExternalHead };
