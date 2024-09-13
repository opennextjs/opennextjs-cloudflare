/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	experimental: {
		// IMPORTANT: this option is necessary for the chunks hack since that relies on the webpack-runtime.js file not being minified
		//            (since we regex-replace relying on specific variable names)
		serverMinification: false,
	},
};

export default nextConfig;
