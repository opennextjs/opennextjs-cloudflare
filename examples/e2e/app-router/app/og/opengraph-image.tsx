import { ImageResponse } from "next/og";

import { ogImage } from "../../../../common/og-image";

// Image metadata
export const alt = ogImage.text;
export const size = ogImage.size;

export const contentType = "image/png";

/**
 * Renders the shared OpenNext fixture as a metadata image.
 *
 * @returns The PNG response using the default fallback font.
 */
export default async function Image() {
	return new ImageResponse(<div style={ogImage.style}>{ogImage.text}</div>, {
		...size,
		headers: {
			"cache-control": "public, immutable, no-transform, max-age=31536000",
		},
	});
}
