"use strict";

// Mimics dependencies such as `next-seo` that render `<Head>` from `next/head`.
// Installed as a `file:` dependency so that it is copied under `node_modules/` and kept external by Next.js.
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
