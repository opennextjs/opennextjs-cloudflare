import { CacheAssetsManifest } from "./src/cli/build/open-next/create-cache-assets-manifest.js";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      __NEXT_PRIVATE_STANDALONE_CONFIG?: string;
      SKIP_NEXT_APP_BUILD?: string;
      SKIP_WRANGLER_CONFIG_CHECK?: string;
      NEXT_PRIVATE_DEBUG_CACHE?: string;
      OPEN_NEXT_ORIGIN: string;
      NODE_ENV?: string;
      __OPENNEXT_CACHE_TAGS_MANIFEST: CacheAssetsManifest;
    }
  }
}

export {};
