import config from "./open-next.config.js";

export default {
	...config,
	// Override the build command to use Turbopack
	buildCommand: "next build --turbopack",
};
