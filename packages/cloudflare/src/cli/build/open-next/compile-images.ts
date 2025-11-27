import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";

/**
 * Compiles the initialization code for the workerd runtime
 */
export async function compileImages(options: BuildOptions) {
	const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)));
	const templatesDir = path.join(currentDir, "../../templates");
	const imagesPath = path.join(templatesDir, "images.js");

	const imagesManifestPath = path.join(options.appBuildOutputPath, ".next/images-manifest.json");
	const imagesManifest = fs.existsSync(imagesManifestPath)
		? JSON.parse(fs.readFileSync(imagesManifestPath, { encoding: "utf-8" }))
		: {};

	const __IMAGES_REMOTE_PATTERNS__ = JSON.stringify(imagesManifest?.images?.remotePatterns ?? []);
	const __IMAGES_LOCAL_PATTERNS__ = JSON.stringify(
		imagesManifest?.images?.localPatterns ?? defaultLocalPatterns
	);
	const __IMAGES_DEVICE_SIZES__ = JSON.stringify(imagesManifest?.images?.deviceSizes ?? defaultDeviceSizes);
	const __IMAGES_IMAGE_SIZES__ = JSON.stringify(imagesManifest?.images?.imageSizes ?? defaultImageSizes);
	const __IMAGES_QUALITIES__ = JSON.stringify(imagesManifest?.images?.qualities ?? defaultQualities);
	const __IMAGES_FORMATS__ = JSON.stringify(imagesManifest?.images?.formats ?? defaultFormats);
	const __IMAGES_MINIMUM_CACHE_TTL_SEC__ = JSON.stringify(
		imagesManifest?.images?.minimumCacheTTL ?? defaultMinimumCacheTTLSec
	);
	const __IMAGES_ALLOW_SVG__ = JSON.stringify(Boolean(imagesManifest?.images?.dangerouslyAllowSVG));
	const __IMAGES_CONTENT_SECURITY_POLICY__ = JSON.stringify(
		imagesManifest?.images?.contentSecurityPolicy ?? "script-src 'none'; frame-src 'none'; sandbox;"
	);
	const __IMAGES_CONTENT_DISPOSITION__ = JSON.stringify(
		imagesManifest?.images?.contentDispositionType ?? "attachment"
	);
	const __IMAGES_MAX_REDIRECTS__ = JSON.stringify(
		imagesManifest?.images?.maximumRedirects ?? defaultMaxRedirects
	);

	await build({
		entryPoints: [imagesPath],
		outdir: path.join(options.outputDir, "cloudflare"),
		bundle: true,
		minify: false,
		format: "esm",
		target: "esnext",
		platform: "node",
		define: {
			__IMAGES_REMOTE_PATTERNS__,
			__IMAGES_LOCAL_PATTERNS__,
			__IMAGES_DEVICE_SIZES__,
			__IMAGES_IMAGE_SIZES__,
			__IMAGES_QUALITIES__,
			__IMAGES_FORMATS__,
			__IMAGES_MINIMUM_CACHE_TTL_SEC__,
			__IMAGES_ALLOW_SVG__,
			__IMAGES_CONTENT_SECURITY_POLICY__,
			__IMAGES_CONTENT_DISPOSITION__,
			__IMAGES_MAX_REDIRECTS__,
		},
	});
}

const defaultDeviceSizes = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];

// 16 was included in Next.js 15
const defaultImageSizes = [32, 48, 64, 96, 128, 256, 384];

// All values between 1-100 were allowed in Next.js 15
const defaultQualities = [75];

// Was unlimited in Next.js 15
const defaultMaxRedirects = 3;

const defaultFormats = ["image/webp"];

const defaultMinimumCacheTTLSec = 14400;

const defaultLocalPatterns = { pathname: "/**" };
