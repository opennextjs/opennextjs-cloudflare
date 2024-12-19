declare global {
  namespace NodeJS {
    interface ProcessEnv {
      __NEXT_PRIVATE_STANDALONE_CONFIG?: string;
      SKIP_NEXT_APP_BUILD?: string;
      NEXT_PRIVATE_DEBUG_CACHE?: string;
      OPEN_NEXT_ORIGIN: string;
      NODE_ENV?: string;
      // Whether process.env has been populated (on first request).
      __PROCESS_ENV_POPULATED?: string;
    }
  }
}

export {};
