import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { describe, expect, test } from "vitest";

import { buildIdRule, createMiddlewareManifestRule } from "./next-server.js";

describe("Next Server", () => {
  test("build ID", () => {
    const code = `
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
    getEnabledDirectories(dev) {
        const dir = dev ? this.dir : this.serverDistDir;
        return {
            app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
            pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
        };
    }
    // ...
}`;

    expect(patchCode(code, buildIdRule)).toMatchInlineSnapshot(`
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
    const code = `
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
    getEnabledDirectories(dev) {
        const dir = dev ? this.dir : this.serverDistDir;
        return {
            app: (0, _findpagesdir.findDir)(dir, "app") ? true : false,
            pages: (0, _findpagesdir.findDir)(dir, "pages") ? true : false
        };
    }
    // ...
}`;

    expect(patchCode(code, createMiddlewareManifestRule("manifest"))).toMatchInlineSnapshot(`
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
