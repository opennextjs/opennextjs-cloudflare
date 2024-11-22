declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ASSETS: Fetcher;
      __NEXT_PRIVATE_STANDALONE_CONFIG?: string;
      SKIP_NEXT_APP_BUILD?: string;
      NEXT_PRIVATE_DEBUG_CACHE?: string;
      __OPENNEXT_KV_BINDING_NAME: string;
      OPEN_NEXT_ORIGIN: string;
    }
  }

  interface Window {
    [key: string]: string | Fetcher;
  }
}

export {};
