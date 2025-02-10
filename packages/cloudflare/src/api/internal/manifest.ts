export function getPrerenderManifest() {
  // TODO: Drop the import - https://github.com/opennextjs/opennextjs-cloudflare/issues/361
  // @ts-expect-error
  return import("./.next/prerender-manifest.json");
}
