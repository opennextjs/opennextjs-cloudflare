import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import {
  buildIdRule,
  createCacheHandlerRule,
  createComposableCacheHandlersRule,
  createMiddlewareManifestRule,
} from "./next-server.js";

describe("Next Server", () => {
  const nextServerCode = `
class NextNodeServer extends _baseserver.default {
    constructor(options){
        // Initialize super class
        super(options);
        this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
    }
    async handleUpgrade() {
    // The web server does not support web sockets, it's only used for HMR in
    // development.
    }
    loadEnvConfig({ dev, forceReload, silent }) {
        (0, _env.loadEnvConfig)(this.dir, dev, silent ? {
            info: ()=>{},
            error: ()=>{}
        } : _log, forceReload);
    }
    async hasPage(pathname) {
        var _this_nextConfig_i18n;
        return !!(0, _require.getMaybePagePath)(pathname, this.distDir, (_this_nextConfig_i18n = this.nextConfig.i18n) == null ? void 0 : _this_nextConfig_i18n.locales, this.enabledDirectories.app);
    }
    getBuildId() {
        const buildIdFile = (0, _path.join)(this.distDir, _constants.BUILD_ID_FILE);
        try {
            return _fs.default.readFileSync(buildIdFile, "utf8").trim();
        } catch (err) {
            if (err.code === "ENOENT") {
                throw new Error(\`Could not find a production build in the '\${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id\`);
            }
            throw err;
        }
    }
    getMiddlewareManifest() {
        if (this.minimalMode) return null;
        const manifest = require(this.middlewareManifestPath);
        return manifest;
    }
    async loadCustomCacheHandlers() {
        const { cacheHandlers } = this.nextConfig.experimental;
        if (!cacheHandlers) return;
        // If we've already initialized the cache handlers interface, don't do it
        // again.
        if (!(0, _handlers.initializeCacheHandlers)()) return;
        for (const [kind, handler] of Object.entries(cacheHandlers)){
            if (!handler) continue;
            (0, _handlers.setCacheHandler)(kind, (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, handler))));
        }
    }
    async getIncrementalCache({ requestHeaders, requestProtocol }) {
        const dev = !!this.renderOpts.dev;
        let CacheHandler;
        const { cacheHandler } = this.nextConfig;
        if (cacheHandler) {
            CacheHandler = (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, cacheHandler)));
        }
        await this.loadCustomCacheHandlers();
        // incremental-cache is request specific
        // although can have shared caches in module scope
        // per-cache handler
        return new _incrementalcache.IncrementalCache({
            fs: this.getCacheFilesystem(),
            dev,
            requestHeaders,
            requestProtocol,
            allowedRevalidateHeaderKeys: this.nextConfig.experimental.allowedRevalidateHeaderKeys,
            minimalMode: this.minimalMode,
            serverDistDir: this.serverDistDir,
            fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
            maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
            flushToDisk: !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
            getPrerenderManifest: ()=>this.getPrerenderManifest(),
            CurCacheHandler: CacheHandler
        });
    }
    getEnabledDirectories(dev) {
        const dir = dev ? this.dir : this.serverDistDir;
        return {
            app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
            pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
        };
    }
    // ...
}`;

  test("build ID", () => {
    expect(patchCode(nextServerCode, buildIdRule)).toMatchInlineSnapshot(`
        "class NextNodeServer extends _baseserver.default {
            constructor(options){
                // Initialize super class
                super(options);
                this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
            }
            async handleUpgrade() {
            // The web server does not support web sockets, it's only used for HMR in
            // development.
            }
            loadEnvConfig({ dev, forceReload, silent }) {
                (0, _env.loadEnvConfig)(this.dir, dev, silent ? {
                    info: ()=>{},
                    error: ()=>{}
                } : _log, forceReload);
            }
            async hasPage(pathname) {
                var _this_nextConfig_i18n;
                return !!(0, _require.getMaybePagePath)(pathname, this.distDir, (_this_nextConfig_i18n = this.nextConfig.i18n) == null ? void 0 : _this_nextConfig_i18n.locales, this.enabledDirectories.app);
            }
            getBuildId() {
          return process.env.NEXT_BUILD_ID;
        }
            getMiddlewareManifest() {
                if (this.minimalMode) return null;
                const manifest = require(this.middlewareManifestPath);
                return manifest;
            }
            async loadCustomCacheHandlers() {
                const { cacheHandlers } = this.nextConfig.experimental;
                if (!cacheHandlers) return;
                // If we've already initialized the cache handlers interface, don't do it
                // again.
                if (!(0, _handlers.initializeCacheHandlers)()) return;
                for (const [kind, handler] of Object.entries(cacheHandlers)){
                    if (!handler) continue;
                    (0, _handlers.setCacheHandler)(kind, (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, handler))));
                }
            }
            async getIncrementalCache({ requestHeaders, requestProtocol }) {
                const dev = !!this.renderOpts.dev;
                let CacheHandler;
                const { cacheHandler } = this.nextConfig;
                if (cacheHandler) {
                    CacheHandler = (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, cacheHandler)));
                }
                await this.loadCustomCacheHandlers();
                // incremental-cache is request specific
                // although can have shared caches in module scope
                // per-cache handler
                return new _incrementalcache.IncrementalCache({
                    fs: this.getCacheFilesystem(),
                    dev,
                    requestHeaders,
                    requestProtocol,
                    allowedRevalidateHeaderKeys: this.nextConfig.experimental.allowedRevalidateHeaderKeys,
                    minimalMode: this.minimalMode,
                    serverDistDir: this.serverDistDir,
                    fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
                    maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
                    flushToDisk: !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
                    getPrerenderManifest: ()=>this.getPrerenderManifest(),
                    CurCacheHandler: CacheHandler
                });
            }
            getEnabledDirectories(dev) {
                const dir = dev ? this.dir : this.serverDistDir;
                return {
                    app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
                    pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
                };
            }
            // ...
        }"
      `);
  });

  test("middleware manifest", () => {
    expect(patchCode(nextServerCode, createMiddlewareManifestRule("manifest"))).toMatchInlineSnapshot(`
      "class NextNodeServer extends _baseserver.default {
          constructor(options){
              // Initialize super class
              super(options);
              this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
          }
          async handleUpgrade() {
          // The web server does not support web sockets, it's only used for HMR in
          // development.
          }
          loadEnvConfig({ dev, forceReload, silent }) {
              (0, _env.loadEnvConfig)(this.dir, dev, silent ? {
                  info: ()=>{},
                  error: ()=>{}
              } : _log, forceReload);
          }
          async hasPage(pathname) {
              var _this_nextConfig_i18n;
              return !!(0, _require.getMaybePagePath)(pathname, this.distDir, (_this_nextConfig_i18n = this.nextConfig.i18n) == null ? void 0 : _this_nextConfig_i18n.locales, this.enabledDirectories.app);
          }
          getBuildId() {
              const buildIdFile = (0, _path.join)(this.distDir, _constants.BUILD_ID_FILE);
              try {
                  return _fs.default.readFileSync(buildIdFile, "utf8").trim();
              } catch (err) {
                  if (err.code === "ENOENT") {
                      throw new Error(\`Could not find a production build in the '\${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id\`);
                  }
                  throw err;
              }
          }
          getMiddlewareManifest() {
        return "manifest";
      }
          async loadCustomCacheHandlers() {
              const { cacheHandlers } = this.nextConfig.experimental;
              if (!cacheHandlers) return;
              // If we've already initialized the cache handlers interface, don't do it
              // again.
              if (!(0, _handlers.initializeCacheHandlers)()) return;
              for (const [kind, handler] of Object.entries(cacheHandlers)){
                  if (!handler) continue;
                  (0, _handlers.setCacheHandler)(kind, (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, handler))));
              }
          }
          async getIncrementalCache({ requestHeaders, requestProtocol }) {
              const dev = !!this.renderOpts.dev;
              let CacheHandler;
              const { cacheHandler } = this.nextConfig;
              if (cacheHandler) {
                  CacheHandler = (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, cacheHandler)));
              }
              await this.loadCustomCacheHandlers();
              // incremental-cache is request specific
              // although can have shared caches in module scope
              // per-cache handler
              return new _incrementalcache.IncrementalCache({
                  fs: this.getCacheFilesystem(),
                  dev,
                  requestHeaders,
                  requestProtocol,
                  allowedRevalidateHeaderKeys: this.nextConfig.experimental.allowedRevalidateHeaderKeys,
                  minimalMode: this.minimalMode,
                  serverDistDir: this.serverDistDir,
                  fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
                  maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
                  flushToDisk: !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
                  getPrerenderManifest: ()=>this.getPrerenderManifest(),
                  CurCacheHandler: CacheHandler
              });
          }
          getEnabledDirectories(dev) {
              const dir = dev ? this.dir : this.serverDistDir;
              return {
                  app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
                  pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
              };
          }
          // ...
      }"
    `);
  });

  test("cache handler", () => {
    expect(patchCode(nextServerCode, createCacheHandlerRule("manifest"))).toMatchInlineSnapshot(`
      "class NextNodeServer extends _baseserver.default {
          constructor(options){
              // Initialize super class
              super(options);
              this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
          }
          async handleUpgrade() {
          // The web server does not support web sockets, it's only used for HMR in
          // development.
          }
          loadEnvConfig({ dev, forceReload, silent }) {
              (0, _env.loadEnvConfig)(this.dir, dev, silent ? {
                  info: ()=>{},
                  error: ()=>{}
              } : _log, forceReload);
          }
          async hasPage(pathname) {
              var _this_nextConfig_i18n;
              return !!(0, _require.getMaybePagePath)(pathname, this.distDir, (_this_nextConfig_i18n = this.nextConfig.i18n) == null ? void 0 : _this_nextConfig_i18n.locales, this.enabledDirectories.app);
          }
          getBuildId() {
              const buildIdFile = (0, _path.join)(this.distDir, _constants.BUILD_ID_FILE);
              try {
                  return _fs.default.readFileSync(buildIdFile, "utf8").trim();
              } catch (err) {
                  if (err.code === "ENOENT") {
                      throw new Error(\`Could not find a production build in the '\${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id\`);
                  }
                  throw err;
              }
          }
          getMiddlewareManifest() {
              if (this.minimalMode) return null;
              const manifest = require(this.middlewareManifestPath);
              return manifest;
          }
          async loadCustomCacheHandlers() {
              const { cacheHandlers } = this.nextConfig.experimental;
              if (!cacheHandlers) return;
              // If we've already initialized the cache handlers interface, don't do it
              // again.
              if (!(0, _handlers.initializeCacheHandlers)()) return;
              for (const [kind, handler] of Object.entries(cacheHandlers)){
                  if (!handler) continue;
                  (0, _handlers.setCacheHandler)(kind, (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, handler))));
              }
          }
          async getIncrementalCache({ requestHeaders, requestProtocol }) {
              const dev = !!this.renderOpts.dev;
              let CacheHandler;
              const cacheHandler = null;
      CacheHandler = require('manifest').default;
              if (cacheHandler) {
                  CacheHandler = (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, cacheHandler)));
              }
              await this.loadCustomCacheHandlers();
              // incremental-cache is request specific
              // although can have shared caches in module scope
              // per-cache handler
              return new _incrementalcache.IncrementalCache({
                  fs: this.getCacheFilesystem(),
                  dev,
                  requestHeaders,
                  requestProtocol,
                  allowedRevalidateHeaderKeys: this.nextConfig.experimental.allowedRevalidateHeaderKeys,
                  minimalMode: this.minimalMode,
                  serverDistDir: this.serverDistDir,
                  fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
                  maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
                  flushToDisk: !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
                  getPrerenderManifest: ()=>this.getPrerenderManifest(),
                  CurCacheHandler: CacheHandler
              });
          }
          getEnabledDirectories(dev) {
              const dir = dev ? this.dir : this.serverDistDir;
              return {
                  app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
                  pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
              };
          }
          // ...
      }"
    `);
  });

  test("composable cache handler", () => {
    expect(patchCode(nextServerCode, createComposableCacheHandlersRule("manifest"))).toMatchInlineSnapshot(`
      "class NextNodeServer extends _baseserver.default {
          constructor(options){
              // Initialize super class
              super(options);
              this.handleNextImageRequest = async (req, res, parsedUrl) => { /* ... */ };
          }
          async handleUpgrade() {
          // The web server does not support web sockets, it's only used for HMR in
          // development.
          }
          loadEnvConfig({ dev, forceReload, silent }) {
              (0, _env.loadEnvConfig)(this.dir, dev, silent ? {
                  info: ()=>{},
                  error: ()=>{}
              } : _log, forceReload);
          }
          async hasPage(pathname) {
              var _this_nextConfig_i18n;
              return !!(0, _require.getMaybePagePath)(pathname, this.distDir, (_this_nextConfig_i18n = this.nextConfig.i18n) == null ? void 0 : _this_nextConfig_i18n.locales, this.enabledDirectories.app);
          }
          getBuildId() {
              const buildIdFile = (0, _path.join)(this.distDir, _constants.BUILD_ID_FILE);
              try {
                  return _fs.default.readFileSync(buildIdFile, "utf8").trim();
              } catch (err) {
                  if (err.code === "ENOENT") {
                      throw new Error(\`Could not find a production build in the '\${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id\`);
                  }
                  throw err;
              }
          }
          getMiddlewareManifest() {
              if (this.minimalMode) return null;
              const manifest = require(this.middlewareManifestPath);
              return manifest;
          }
          async loadCustomCacheHandlers() {
              const cacheHandlers = null;
      const handlersSymbol = Symbol.for('@next/cache-handlers');
      const handlersMapSymbol = Symbol.for('@next/cache-handlers-map');
      const handlersSetSymbol = Symbol.for('@next/cache-handlers-set');
      globalThis[handlersMapSymbol] = new Map();
      globalThis[handlersMapSymbol].set("default", require('manifest').default);
      globalThis[handlersSetSymbol] = new Set(globalThis[handlersMapSymbol].values());
              if (!cacheHandlers) return;
              // If we've already initialized the cache handlers interface, don't do it
              // again.
              if (!(0, _handlers.initializeCacheHandlers)()) return;
              for (const [kind, handler] of Object.entries(cacheHandlers)){
                  if (!handler) continue;
                  (0, _handlers.setCacheHandler)(kind, (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, handler))));
              }
          }
          async getIncrementalCache({ requestHeaders, requestProtocol }) {
              const dev = !!this.renderOpts.dev;
              let CacheHandler;
              const { cacheHandler } = this.nextConfig;
              if (cacheHandler) {
                  CacheHandler = (0, _interopdefault.interopDefault)(await dynamicImportEsmDefault((0, _formatdynamicimportpath.formatDynamicImportPath)(this.distDir, cacheHandler)));
              }
              await this.loadCustomCacheHandlers();
              // incremental-cache is request specific
              // although can have shared caches in module scope
              // per-cache handler
              return new _incrementalcache.IncrementalCache({
                  fs: this.getCacheFilesystem(),
                  dev,
                  requestHeaders,
                  requestProtocol,
                  allowedRevalidateHeaderKeys: this.nextConfig.experimental.allowedRevalidateHeaderKeys,
                  minimalMode: this.minimalMode,
                  serverDistDir: this.serverDistDir,
                  fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
                  maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
                  flushToDisk: !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
                  getPrerenderManifest: ()=>this.getPrerenderManifest(),
                  CurCacheHandler: CacheHandler
              });
          }
          getEnabledDirectories(dev) {
              const dir = dev ? this.dir : this.serverDistDir;
              return {
                  app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
                  pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
              };
          }
          // ...
      }"
    `);
  });
});
