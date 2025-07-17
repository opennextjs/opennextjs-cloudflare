export const metadata = {
	title: "API hello-world",
	description: "a simple api hello-world app",
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
