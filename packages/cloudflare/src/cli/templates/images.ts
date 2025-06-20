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
export function fetchImage(fetcher: Fetcher | undefined, imageUrl: string) {
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

  return fetch(imageUrl, { cf: { cacheEverything: true } });
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
  if (!new RegExp(pattern.pathname).test(url.pathname)) {
    return false;
  }

  return true;
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

/* eslint-disable no-var */
declare global {
  var __IMAGES_REMOTE_PATTERNS__: RemotePattern[];
  var __IMAGES_LOCAL_PATTERNS__: LocalPattern[];
}
/* eslint-enable no-var */
