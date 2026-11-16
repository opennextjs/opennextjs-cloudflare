// Keep this fixture dependency-free so each example uses its own React and Next.js versions.
// Do not supply a custom font: these images exercise the OG fallback-font patch.
export const ogImage = {
	text: "OpenNext",
	size: { width: 1200, height: 630 },
	style: {
		fontSize: 128,
		background: "white",
		width: "100%",
		height: "100%",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
} as const;
