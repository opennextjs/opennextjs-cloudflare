export type RemotePattern = {
	protocol?: "http" | "https";
	hostname: string;
	port?: string;
	// pathname is always set in the manifest (to `makeRe(pathname ?? '**', { dot: true }).source`)
	pathname: string;
	search?: string;
};

export type LocalPattern = {
	// pathname is always set in the manifest
	pathname: string;
	search?: string;
};

/**
 * Fetches an images.
 *
 * Local images (starting with a '/' as fetched using the passed fetcher).
 * Remote images should match the configured remote patterns or a 404 response is returned.
 */
export async function fetchImage(fetcher: Fetcher | undefined, imageUrl: string, ctx: ExecutionContext) {
	// https://github.com/vercel/next.js/blob/d76f0b1/packages/next/src/server/image-optimizer.ts#L208
	if (!imageUrl || imageUrl.length > 3072 || imageUrl.startsWith("//")) {
		return getUrlErrorResponse();
	}

	// Local
	if (imageUrl.startsWith("/")) {
		let pathname: string;
		let url: URL;
		try {
			// We only need pathname and search
			url = new URL(imageUrl, "http://n");
			pathname = decodeURIComponent(url.pathname);
		} catch {
			return getUrlErrorResponse();
		}

		if (/\/_next\/image($|\/)/.test(pathname)) {
			return getUrlErrorResponse();
		}

		// If localPatterns are not defined all local images are allowed.
		if (
			__IMAGES_LOCAL_PATTERNS__.length > 0 &&
			!__IMAGES_LOCAL_PATTERNS__.some((p: LocalPattern) => matchLocalPattern(p, url))
		) {
			return getUrlErrorResponse();
		}

		return fetcher?.fetch(`http://assets.local${imageUrl}`);
	}

	// Remote
	let url: URL;
	try {
		url = new URL(imageUrl);
	} catch {
		return getUrlErrorResponse();
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return getUrlErrorResponse();
	}

	// The remotePatterns is used to allow images from specific remote external paths and block all others.
	if (!__IMAGES_REMOTE_PATTERNS__.some((p: RemotePattern) => matchRemotePattern(p, url))) {
		return getUrlErrorResponse();
	}

	const imgResponse = await fetch(imageUrl, { cf: { cacheEverything: true } });

	if (!imgResponse.body) {
		return imgResponse;
	}

	const buffer = new ArrayBuffer(32);

	try {
		let contentType: string | undefined;
		// body1 is eventually used for the response
		// body2 is used to detect the content type
		const [body1, body2] = imgResponse.body.tee();
		const reader = body2.getReader({ mode: "byob" });
		const { value } = await reader.read(new Uint8Array(buffer));
		// Release resources by calling `reader.cancel()`
		// `ctx.waitUntil` keeps the runtime running until the promise settles without having to wait here.
		ctx.waitUntil(reader.cancel());

		if (value) {
			contentType = detectContentType(value);
		}

		if (contentType && !(contentType === SVG && !__IMAGES_ALLOW_SVG__)) {
			const headers = new Headers(imgResponse.headers);
			headers.set("content-type", contentType);
			headers.set("content-disposition", __IMAGES_CONTENT_DISPOSITION__);
			headers.set("content-security-policy", __IMAGES_CONTENT_SECURITY_POLICY__);
			return new Response(body1, { ...imgResponse, headers });
		}

		return new Response('"url" parameter is valid but image type is not allowed', {
			status: 400,
		});
	} catch {
		return new Response('"url" parameter is valid but upstream response is invalid', {
			status: 400,
		});
	}
}

export function matchRemotePattern(pattern: RemotePattern, url: URL): boolean {
	// https://github.com/vercel/next.js/blob/d76f0b1/packages/next/src/shared/lib/match-remote-pattern.ts
	if (
		pattern.protocol !== undefined &&
		pattern.protocol.replace(/:$/, "") !== url.protocol.replace(/:$/, "")
	) {
		return false;
	}

	if (pattern.port !== undefined && pattern.port !== url.port) {
		return false;
	}

	if (pattern.hostname === undefined || !new RegExp(pattern.hostname).test(url.hostname)) {
		return false;
	}

	if (pattern.search !== undefined && pattern.search !== url.search) {
		return false;
	}

	// Should be the same as writeImagesManifest()
	return new RegExp(pattern.pathname).test(url.pathname);
}

export function matchLocalPattern(pattern: LocalPattern, url: URL): boolean {
	// https://github.com/vercel/next.js/blob/d76f0b1/packages/next/src/shared/lib/match-local-pattern.ts
	if (pattern.search !== undefined && pattern.search !== url.search) {
		return false;
	}

	return new RegExp(pattern.pathname).test(url.pathname);
}

/**
 * @returns same error as Next.js when the url query parameter is not accepted.
 */
function getUrlErrorResponse() {
	return new Response(`"url" parameter is not allowed`, { status: 400 });
}

const AVIF = "image/avif";
const WEBP = "image/webp";
const PNG = "image/png";
const JPEG = "image/jpeg";
const GIF = "image/gif";
const SVG = "image/svg+xml";
const ICO = "image/x-icon";
const ICNS = "image/x-icns";
const TIFF = "image/tiff";
const BMP = "image/bmp";

/**
 * Detects the content type by looking at the first few bytes of a file
 *
 * Based on https://github.com/vercel/next.js/blob/72c9635/packages/next/src/server/image-optimizer.ts#L155
 *
 * @param buffer The image bytes
 * @returns a content type of undefined for unsupported content
 */
export function detectContentType(buffer: Uint8Array) {
	if ([0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
		return JPEG;
	}
	if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buffer[i] === b)) {
		return PNG;
	}
	if ([0x47, 0x49, 0x46, 0x38].every((b, i) => buffer[i] === b)) {
		return GIF;
	}
	if ([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50].every((b, i) => !b || buffer[i] === b)) {
		return WEBP;
	}
	if ([0x3c, 0x3f, 0x78, 0x6d, 0x6c].every((b, i) => buffer[i] === b)) {
		return SVG;
	}
	if ([0x3c, 0x73, 0x76, 0x67].every((b, i) => buffer[i] === b)) {
		return SVG;
	}
	if ([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every((b, i) => !b || buffer[i] === b)) {
		return AVIF;
	}
	if ([0x00, 0x00, 0x01, 0x00].every((b, i) => buffer[i] === b)) {
		return ICO;
	}
	if ([0x69, 0x63, 0x6e, 0x73].every((b, i) => buffer[i] === b)) {
		return ICNS;
	}
	if ([0x49, 0x49, 0x2a, 0x00].every((b, i) => buffer[i] === b)) {
		return TIFF;
	}
	if ([0x42, 0x4d].every((b, i) => buffer[i] === b)) {
		return BMP;
	}
}

/* eslint-disable no-var */
declare global {
	var __IMAGES_REMOTE_PATTERNS__: RemotePattern[];
	var __IMAGES_LOCAL_PATTERNS__: LocalPattern[];
	var __IMAGES_ALLOW_SVG__: boolean;
	var __IMAGES_CONTENT_SECURITY_POLICY__: string;
	var __IMAGES_CONTENT_DISPOSITION__: string;
}
/* eslint-enable no-var */
