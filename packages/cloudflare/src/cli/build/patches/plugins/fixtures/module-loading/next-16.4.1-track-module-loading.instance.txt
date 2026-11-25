"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    trackPendingChunkLoad: null,
    trackPendingImport: null,
    trackPendingModules: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    trackPendingChunkLoad: function() {
        return trackPendingChunkLoad;
    },
    trackPendingImport: function() {
        return trackPendingImport;
    },
    trackPendingModules: function() {
        return trackPendingModules;
    }
});
const _cachesignal = require("../cache-signal");
/**
 * Tracks all in-flight async imports and chunk loads.
 * Initialized lazily, because we don't want this to error in case it gets pulled into an edge runtime module.
 */ let _moduleLoadingSignal;
function getModuleLoadingSignal() {
    if (!_moduleLoadingSignal) {
        _moduleLoadingSignal = new _cachesignal.CacheSignal(null);
    }
    return _moduleLoadingSignal;
}
function trackPendingChunkLoad(promise) {
    const moduleLoadingSignal = getModuleLoadingSignal();
    moduleLoadingSignal.trackRead(promise);
}
function trackPendingImport(exportsOrPromise) {
    const moduleLoadingSignal = getModuleLoadingSignal();
    // requiring an async module returns a promise.
    // if it's sync, there's nothing to track.
    if (exportsOrPromise instanceof Promise) {
        moduleLoadingSignal.trackRead(exportsOrPromise);
    }
}
function trackPendingModules(cacheSignal) {
    const moduleLoadingSignal = getModuleLoadingSignal();
    // We can't just use `cacheSignal.trackRead(moduleLoadingSignal.cacheReady())`,
    // because we might start and finish multiple batches of module loads while waiting for caches,
    // and `moduleLoadingSignal.cacheReady()` would resolve after the first batch.
    // Instead, we'll keep notifying `cacheSignal` of each import/chunk-load.
    const unsubscribe = moduleLoadingSignal.subscribeToReads(cacheSignal);
    // Later, when `cacheSignal` is no longer waiting for any caches (or imports that we've notified it of),
    // we can unsubscribe it.
    cacheSignal.cacheReady().then(unsubscribe);
}

//# sourceMappingURL=track-module-loading.instance.js.map