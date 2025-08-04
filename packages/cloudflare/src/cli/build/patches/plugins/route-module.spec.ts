import { expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import { forceTrustHostHeader, getIncrementalCacheRule } from "./route-module.js";

const code = `class n9 {
    constructor({ userland: e10, definition: t10, distDir: r10, projectDir: n10 }) {
    this.userland = e10, this.definition = t10, this.isDev = false, this.distDir = r10, this.projectDir = n10;
    }
    async getIncrementalCache(e10, t10, n10) {
    {
        let i2, { cacheHandler: a2 } = t10;
        if (a2) {
        let { formatDynamicImportPath: e11 } = r("./dist/esm/lib/format-dynamic-import-path.js");
        i2 = rn(await n5(e11(this.distDir, a2)));
        }
        let { join: s2 } = r("node:path"), o2 = B(e10, "projectDir") || s2(process.cwd(), this.projectDir);
        return await this.loadCustomCacheHandlers(e10, t10), new n3({ fs: r("./dist/esm/server/lib/node-fs-methods.js").V, dev: this.isDev, requestHeaders: e10.headers, allowedRevalidateHeaderKeys: t10.experimental.allowedRevalidateHeaderKeys, minimalMode: B(e10, "minimalMode"), serverDistDir: \`\${o2}/\${this.distDir}/server\`, fetchCacheKeyPrefix: t10.experimental.fetchCacheKeyPrefix, maxMemoryCacheSize: t10.cacheMaxMemorySize, flushToDisk: t10.experimental.isrFlushToDisk, getPrerenderManifest: () => n10, CurCacheHandler: i2 });
    }
    }
    async onRequestError(e10, t10, r10, n10) {
    (null == n10 ? void 0 : n10.logErrorWithOriginalStack) ? n10.logErrorWithOriginalStack(t10, "app-dir") : console.error(t10), await this.instrumentationOnRequestError(e10, t10, { path: e10.url || "/", headers: e10.headers, method: e10.method || "GET" }, r10);
    }
    async prepare(e10, t10, { srcPage: n10, multiZoneDraftMode: i2 }) {
    var a2;
    let s2, o2, l2, u2;
    {
        let { join: t11, relative: n11 } = r("node:path");
        s2 = B(e10, "projectDir") || t11(process.cwd(), this.projectDir);
        let i3 = B(e10, "distDir");
        i3 && (this.distDir = n11(s2, i3));
        let { ensureInstrumentationRegistered: a3 } = await Promise.resolve().then(r.t.bind(r, "../lib/router-utils/instrumentation-globals.external", 23));
        a3(s2, this.distDir);
    }
    let c2 = await this.loadManifests(n10, s2), { routesManifest: d2, prerenderManifest: f2, serverFilesManifest: h2 } = c2, { basePath: p2, i18n: m2, rewrites: g2 } = d2;
    p2 && (e10.url = ee(e10.url || "/", p2));
    let y2 = ng(e10.url || "/");
    if (!y2) return;
    let v2 = false;
    (0, J.Y)(y2.pathname || "/", "/_next/data") && (v2 = true, y2.pathname = nG(y2.pathname || "/"));
    let b2 = y2.pathname || "/", _2 = { ...y2.query }, w2 = nz(n10);
    m2 && (o2 = Z(y2.pathname || "/", m2.locales)).detectedLocale && (e10.url = \`\${o2.pathname}\${y2.search}\`, b2 = o2.pathname, l2 || (l2 = o2.detectedLocale));
    let S2 = function({ page: e11, i18n: t11, basePath: n11, rewrites: i3, pageIsDynamic: a3, trailingSlash: s3, caseSensitive: o3 }) {
        let l3, u3, c3;
        return a3 && (c3 = (u3 = nf(l3 = function(e12, t12) {
        var r10, n12, i4;
        let a4 = function(e13, t13, r11, n13, i5) {
            let a5, s5 = (a5 = 0, () => {
            let e14 = "", t14 = ++a5;
            for (; t14 > 0; ) e14 += String.fromCharCode(97 + (t14 - 1) % 26), t14 = Math.floor((t14 - 1) / 26);
            return e14;
            }), o4 = {}, l4 = [];
            for (let a6 of (0, X.Q)(e13).slice(1).split("/")) {
            let e14 = tp.Wz.some((e15) => a6.startsWith(e15)), u4 = a6.match(rq);
            if (e14 && u4 && u4[2]) l4.push(rG({ getSafeRouteKey: s5, interceptionMarker: u4[1], segment: u4[2], routeKeys: o4, keyPrefix: t13 ? q.u7 : void 0, backreferenceDuplicateKeys: i5 }));
            else if (u4 && u4[2]) {
                n13 && u4[1] && l4.push("/" + rB(u4[1]));
                let e15 = rG({ getSafeRouteKey: s5, segment: u4[2], routeKeys: o4, keyPrefix: t13 ? q.dN : void 0, backreferenceDuplicateKeys: i5 });
                n13 && u4[1] && (e15 = e15.substring(1)), l4.push(e15);
            } else l4.push("/" + rB(a6));
            r11 && u4 && u4[3] && l4.push(rB(u4[3]));
            }
            return { namedParameterizedRoute: l4.join(""), routeKeys: o4 };
        }(e12, t12.prefixRouteKeys, null != (r10 = t12.includeSuffix) && r10, null != (n12 = t12.includePrefix) && n12, null != (i4 = t12.backreferenceDuplicateKeys) && i4), s4 = a4.namedParameterizedRoute;
        return t12.excludeOptionalTrailingSlash || (s4 += "(?:/)?"), { ...function(e13, t13) {
            let { includeSuffix: r11 = false, includePrefix: n13 = false, excludeOptionalTrailingSlash: i5 = false } = void 0 === t13 ? {} : t13, { parameterizedRoute: a5, groups: s5 } = function(e14, t14, r12) {
            let n14 = {}, i6 = 1, a6 = [];
            for (let s6 of (0, X.Q)(e14).slice(1).split("/")) {
                let e15 = tp.Wz.find((e16) => s6.startsWith(e16)), o5 = s6.match(rq);
                if (e15 && o5 && o5[2]) {
                let { key: t15, optional: r13, repeat: s7 } = rz(o5[2]);
                n14[t15] = { pos: i6++, repeat: s7, optional: r13 }, a6.push("/" + rB(e15) + "([^/]+?)");
                } else if (o5 && o5[2]) {
                let { key: e16, repeat: t15, optional: s7 } = rz(o5[2]);
                n14[e16] = { pos: i6++, repeat: t15, optional: s7 }, r12 && o5[1] && a6.push("/" + rB(o5[1]));
                let l4 = t15 ? s7 ? "(?:/(.+?))?" : "/(.+?)" : "/([^/]+?)";
                r12 && o5[1] && (l4 = l4.substring(1)), a6.push(l4);
                } else a6.push("/" + rB(s6));
                t14 && o5 && o5[3] && a6.push(rB(o5[3]));
            }
            return { parameterizedRoute: a6.join(""), groups: n14 };
            }(e13, r11, n13), o4 = a5;
            return i5 || (o4 += "(?:/)?"), { re: RegExp("^" + o4 + "$"), groups: s5 };
        }(e12, t12), namedRegex: "^" + s4 + "$", routeKeys: a4.routeKeys };
        }(e11, { prefixRouteKeys: false })))(e11)), { handleRewrites: function(l4, c4) {
        let d3 = {}, f3 = c4.pathname, h3 = (i4) => {
            let h4 = function(e12, t12) {
            let r10 = [], n12 = (0, nd.pathToRegexp)(e12, r10, { delimiter: "/", sensitive: "boolean" == typeof (null == t12 ? void 0 : t12.sensitive) && t12.sensitive, strict: null == t12 ? void 0 : t12.strict }), i5 = (0, nd.regexpToFunction)((null == t12 ? void 0 : t12.regexModifier) ? new RegExp(t12.regexModifier(n12.source), n12.flags) : n12, r10);
            return (e13, n13) => {
                if ("string" != typeof e13) return false;
                let a4 = i5(e13);
                if (!a4) return false;
                if (null == t12 ? void 0 : t12.removeUnnamedParams) for (let e14 of r10) "number" == typeof e14.name && delete a4.params[e14.name];
                return { ...n13, ...a4.params };
            };
            }(i4.source + (s3 ? "(/)?" : ""), { removeUnnamedParams: true, strict: true, sensitive: !!o3 });
            if (!c4.pathname) return false;
            let p3 = h4(c4.pathname);
            if ((i4.has || i4.missing) && p3) {
            let e12 = function(e13, t12, n12, i5) {
                void 0 === n12 && (n12 = []), void 0 === i5 && (i5 = []);
                let a4 = {}, s4 = (n13) => {
                let i6, s5 = n13.key;
                switch (n13.type) {
                    case "header":
                    s5 = s5.toLowerCase(), i6 = e13.headers[s5];
                    break;
                    case "cookie":
                    if ("cookies" in e13) i6 = e13.cookies[n13.key];
                    else {
                        var o4;
                        i6 = (o4 = e13.headers, function() {
                        let { cookie: e14 } = o4;
                        if (!e14) return {};
                        let { parse: t13 } = r("./dist/compiled/cookie/index.js");
                        return t13(Array.isArray(e14) ? e14.join("; ") : e14);
                        })()[n13.key];
                    }
                    break;
                    case "query":
                    i6 = t12[s5];
                    break;
                    case "host": {
                    let { host: t13 } = (null == e13 ? void 0 : e13.headers) || {};
                    i6 = null == t13 ? void 0 : t13.split(":", 1)[0].toLowerCase();
                    }
                }
                if (!n13.value && i6) return a4[function(e14) {
                    let t13 = "";
                    for (let r10 = 0; r10 < e14.length; r10++) {
                    let n14 = e14.charCodeAt(r10);
                    (n14 > 64 && n14 < 91 || n14 > 96 && n14 < 123) && (t13 += e14[r10]);
                    }
                    return t13;
                }(s5)] = i6, true;
                if (i6) {
                    let e14 = RegExp("^" + n13.value + "$"), t13 = Array.isArray(i6) ? i6.slice(-1)[0].match(e14) : i6.match(e14);
                    if (t13) return Array.isArray(t13) && (t13.groups ? Object.keys(t13.groups).forEach((e15) => {
                    a4[e15] = t13.groups[e15];
                    }) : "host" === n13.type && t13[0] && (a4.host = t13[0])), true;
                }
                return false;
                };
                return !(!n12.every((e14) => s4(e14)) || i5.some((e14) => s4(e14))) && a4;
            }(l4, c4.query, i4.has, i4.missing);
            e12 ? Object.assign(p3, e12) : p3 = false;
            }
            if (p3) {
            try {
                var m3, g3;
                if ((null == (g3 = i4.has) || null == (m3 = g3[0]) ? void 0 : m3.key) === em.TP) {
                let e12 = l4.headers[em.Tk.toLowerCase()];
                e12 && (p3 = { ...(0, r1.Fb)(tw(e12)), ...p3 });
                }
            } catch (e12) {
            }
            let { parsedDestination: r10, destQuery: s4 } = function(e12) {
                let t12, r11, n12 = function(e13) {
                let t13 = e13.destination;
                for (let r13 of Object.keys({ ...e13.params, ...e13.query })) r13 && (t13 = t13.replace(RegExp(":" + rB(r13), "g"), "__ESC_COLON_" + r13));
                let r12 = function(e14) {
                    if (e14.startsWith("/")) return rJ(e14);
                    let t14 = new URL(e14);
                    return { hash: t14.hash, hostname: t14.hostname, href: t14.href, pathname: t14.pathname, port: t14.port, protocol: t14.protocol, query: rV(t14.searchParams), search: t14.search, slashes: "//" === t14.href.slice(t14.protocol.length, t14.protocol.length + 2) };
                }(t13), n13 = r12.pathname;
                n13 && (n13 = nh(n13));
                let i6 = r12.href;
                i6 && (i6 = nh(i6));
                let a5 = r12.hostname;
                a5 && (a5 = nh(a5));
                let s6 = r12.hash;
                return s6 && (s6 = nh(s6)), { ...r12, pathname: n13, hostname: a5, href: i6, hash: s6 };
                }(e12), { hostname: i5, query: a4 } = n12, s5 = n12.pathname;
                n12.hash && (s5 = "" + s5 + n12.hash);
                let o4 = [], l5 = [];
                for (let e13 of ((0, nd.pathToRegexp)(s5, l5), l5)) o4.push(e13.name);
                if (i5) {
                let e13 = [];
                for (let t13 of ((0, nd.pathToRegexp)(i5, e13), e13)) o4.push(t13.name);
                }
                let u4 = (0, nd.compile)(s5, { validate: false });
                for (let [r12, n13] of (i5 && (t12 = (0, nd.compile)(i5, { validate: false })), Object.entries(a4))) Array.isArray(n13) ? a4[r12] = n13.map((t13) => np(nh(t13), e12.params)) : "string" == typeof n13 && (a4[r12] = np(nh(n13), e12.params));
                let c5 = Object.keys(e12.params).filter((e13) => "nextInternalLocale" !== e13);
                if (e12.appendParamsToQuery && !c5.some((e13) => o4.includes(e13))) for (let t13 of c5) t13 in a4 || (a4[t13] = e12.params[t13]);
                if ((0, tp.Ag)(s5)) for (let t13 of s5.split("/")) {
                let r12 = tp.Wz.find((e13) => t13.startsWith(e13));
                if (r12) {
                    "(..)(..)" === r12 ? (e12.params["0"] = "(..)", e12.params["1"] = "(..)") : e12.params["0"] = r12;
                    break;
                }
                }
                try {
                let [i6, a5] = (r11 = u4(e12.params)).split("#", 2);
                t12 && (n12.hostname = t12(e12.params)), n12.pathname = i6, n12.hash = (a5 ? "#" : "") + (a5 || ""), delete n12.search;
                } catch (e13) {
                if (e13.message.match(/Expected .*? to not repeat, but got an array/)) throw Object.defineProperty(Error("To use a multi-match in the destination you must add \`*<param>\` at the end of the param name to signify it should repeat. https://nextjs.org/docs/messages/invalid-multi-match"), "__NEXT_ERROR_CODE", { value: "E329", enumerable: false, configurable: true });
                throw e13;
                }
                return n12.query = { ...e12.query, ...n12.query }, { newUrl: r11, destQuery: a4, parsedDestination: n12 };
            }({ appendParamsToQuery: true, destination: i4.destination, params: p3, query: c4.query });
            if (r10.protocol) return true;
            if (Object.assign(d3, s4, p3), Object.assign(c4.query, r10.query), delete r10.query, Object.entries(c4.query).forEach(([e12, t12]) => {
                if (t12 && "string" == typeof t12 && t12.startsWith(":")) {
                let r11 = d3[t12.slice(1)];
                r11 && (c4.query[e12] = r11);
                }
            }), Object.assign(c4, r10), !(f3 = c4.pathname)) return false;
            if (n11 && (f3 = f3.replace(RegExp(\`^\${n11}\`), "") || "/"), t11) {
                let e12 = Z(f3, t11.locales);
                f3 = e12.pathname, c4.query.nextInternalLocale = e12.detectedLocale || p3.nextInternalLocale;
            }
            if (f3 === e11) return true;
            if (a3 && u3) {
                let e12 = u3(f3);
                if (e12) return c4.query = { ...c4.query, ...e12 }, true;
            }
            }
            return false;
        };
        for (let e12 of i3.beforeFiles || []) h3(e12);
        if (f3 !== e11) {
            let t12 = false;
            for (let e12 of i3.afterFiles || []) if (t12 = h3(e12)) break;
            if (!t12 && !(() => {
            let t13 = (0, X.Q)(f3 || "");
            return t13 === (0, X.Q)(e11) || (null == u3 ? void 0 : u3(t13));
            })()) {
            for (let e12 of i3.fallback || []) if (t12 = h3(e12)) break;
            }
        }
        return d3;
        }, defaultRouteRegex: l3, dynamicRouteMatcher: u3, defaultRouteMatches: c3, normalizeQueryParams: function(e12, t12) {
        for (let [r10, n12] of (delete e12.nextInternalLocale, Object.entries(e12))) {
            let i4 = z(r10);
            i4 && (delete e12[r10], t12.add(i4), void 0 !== n12 && (e12[i4] = Array.isArray(n12) ? n12.map((e13) => nm(e13)) : nm(n12)));
        }
        }, getParamsFromRouteMatches: function(e12) {
        if (!l3) return null;
        let { groups: t12, routeKeys: r10 } = l3, n12 = nf({ re: { exec: (e13) => {
            let n13 = Object.fromEntries(new URLSearchParams(e13));
            for (let [e14, t13] of Object.entries(n13)) {
            let r11 = z(e14);
            r11 && (n13[r11] = t13, delete n13[e14]);
            }
            let i4 = {};
            for (let e14 of Object.keys(r10)) {
            let a4 = r10[e14];
            if (!a4) continue;
            let s4 = t12[a4], o4 = n13[e14];
            if (!s4.optional && !o4) return null;
            i4[s4.pos] = o4;
            }
            return i4;
        } }, groups: t12 })(e12);
        return n12 || null;
        }, normalizeDynamicRouteParams: (e12, t12) => {
        if (!l3 || !c3) return { params: {}, hasValidParams: false };
        var r10 = l3, n12 = c3;
        let i4 = {};
        for (let a4 of Object.keys(r10.groups)) {
            let s4 = e12[a4];
            "string" == typeof s4 ? s4 = (0, eQ.b)(s4) : Array.isArray(s4) && (s4 = s4.map(eQ.b));
            let o4 = n12[a4], l4 = r10.groups[a4].optional;
            if ((Array.isArray(o4) ? o4.some((e13) => Array.isArray(s4) ? s4.some((t13) => t13.includes(e13)) : null == s4 ? void 0 : s4.includes(e13)) : null == s4 ? void 0 : s4.includes(o4)) || void 0 === s4 && !(l4 && t12)) return { params: {}, hasValidParams: false };
            l4 && (!s4 || Array.isArray(s4) && 1 === s4.length && ("index" === s4[0] || s4[0] === \`[[...\${a4}]]\`)) && (s4 = void 0, delete e12[a4]), s4 && "string" == typeof s4 && r10.groups[a4].repeat && (s4 = s4.split("/")), s4 && (i4[a4] = s4);
        }
        return { params: i4, hasValidParams: true };
        }, normalizeCdnUrl: (e12, t12) => function(e13, t13) {
        let r10 = ng(e13.url);
        if (!r10) return e13.url;
        delete r10.search, nv(r10.query, t13), e13.url = function(e14) {
            let { auth: t14, hostname: r11 } = e14, n12 = e14.protocol || "", i4 = e14.pathname || "", a4 = e14.hash || "", s4 = e14.query || "", o4 = false;
            t14 = t14 ? encodeURIComponent(t14).replace(/%3A/i, ":") + "@" : "", e14.host ? o4 = t14 + e14.host : r11 && (o4 = t14 + (~r11.indexOf(":") ? "[" + r11 + "]" : r11), e14.port && (o4 += ":" + e14.port)), s4 && "object" == typeof s4 && (s4 = String(function(e15) {
            let t15 = new URLSearchParams();
            for (let [r12, n13] of Object.entries(e15)) if (Array.isArray(n13)) for (let e16 of n13) t15.append(r12, rK(e16));
            else t15.set(r12, rK(n13));
            return t15;
            }(s4)));
            let l4 = e14.search || s4 && "?" + s4 || "";
            return n12 && !n12.endsWith(":") && (n12 += ":"), e14.slashes || (!n12 || ny.test(n12)) && false !== o4 ? (o4 = "//" + (o4 || ""), i4 && "/" !== i4[0] && (i4 = "/" + i4)) : o4 || (o4 = ""), a4 && "#" !== a4[0] && (a4 = "#" + a4), l4 && "?" !== l4[0] && (l4 = "?" + l4), "" + n12 + o4 + (i4 = i4.replace(/[?#]/g, encodeURIComponent)) + (l4 = l4.replace("#", "%23")) + a4;
        }(r10);
        }(e12, t12), interpolateDynamicPath: (e12, t12) => function(e13, t13, r10) {
        if (!r10) return e13;
        for (let n12 of Object.keys(r10.groups)) {
            let i4, { optional: a4, repeat: s4 } = r10.groups[n12], o4 = \`[\${s4 ? "..." : ""}\${n12}]\`;
            a4 && (o4 = \`[\${o4}]\`);
            let l4 = t13[n12];
            ((i4 = Array.isArray(l4) ? l4.map((e14) => e14 && encodeURIComponent(e14)).join("/") : l4 ? encodeURIComponent(l4) : "") || a4) && (e13 = e13.replaceAll(o4, i4));
        }
        return e13;
        }(e12, t12, l3), filterInternalQuery: (e12, t12) => nv(e12, t12) };
    }({ page: n10, i18n: m2, basePath: p2, rewrites: g2, pageIsDynamic: w2, trailingSlash: process.env.__NEXT_TRAILING_SLASH, caseSensitive: !!d2.caseSensitive }), k2 = G(null == m2 ? void 0 : m2.domains, Y(y2, e10.headers), l2);
    !function(e11, t11, r10) {
        let n11 = B(e11);
        n11[t11] = r10, e11[H] = n11;
    }(e10, "isLocaleDomain", !!k2);
    let E2 = (null == k2 ? void 0 : k2.defaultLocale) || (null == m2 ? void 0 : m2.defaultLocale);
    E2 && !l2 && (y2.pathname = \`/\${E2}\${"/" === y2.pathname ? "" : y2.pathname}\`);
    let R2 = B(e10, "locale") || l2 || E2, x2 = Object.keys(S2.handleRewrites(e10, y2));
    m2 && (y2.pathname = Z(y2.pathname || "/", m2.locales).pathname);
    let C2 = B(e10, "params");
    if (!C2 && S2.dynamicRouteMatcher) {
        let e11 = S2.dynamicRouteMatcher(nG((null == o2 ? void 0 : o2.pathname) || y2.pathname || "/")), t11 = S2.normalizeDynamicRouteParams(e11 || {}, true);
        t11.hasValidParams && (C2 = t11.params);
    }
    let T2 = B(e10, "query") || { ...y2.query }, P2 = /* @__PURE__ */ new Set(), j2 = [];
    if (!this.isAppRouter) for (let e11 of [...x2, ...Object.keys(S2.defaultRouteMatches || {})]) {
        let t11 = Array.isArray(_2[e11]) ? _2[e11].join("") : _2[e11], r10 = Array.isArray(T2[e11]) ? T2[e11].join("") : T2[e11];
        e11 in _2 && t11 !== r10 || j2.push(e11);
    }
    if (S2.normalizeCdnUrl(e10, j2), S2.normalizeQueryParams(T2, P2), S2.filterInternalQuery(_2, j2), w2) {
        let t11 = S2.normalizeDynamicRouteParams(T2, true), r10 = S2.normalizeDynamicRouteParams(C2 || {}, true).hasValidParams && C2 ? C2 : t11.hasValidParams ? T2 : {};
        if (e10.url = S2.interpolateDynamicPath(e10.url || "/", r10), y2.pathname = S2.interpolateDynamicPath(y2.pathname || "/", r10), b2 = S2.interpolateDynamicPath(b2, r10), !C2) if (t11.hasValidParams) for (let e11 in C2 = Object.assign({}, t11.params), S2.defaultRouteMatches) delete T2[e11];
        else {
        let e11 = null == S2.dynamicRouteMatcher ? void 0 : S2.dynamicRouteMatcher.call(S2, nG((null == o2 ? void 0 : o2.pathname) || y2.pathname || "/"));
        e11 && (C2 = Object.assign({}, e11));
        }
    }
    for (let e11 of P2) e11 in _2 || delete T2[e11];
    let { isOnDemandRevalidate: O2, revalidateOnlyGenerated: A2 } = (0, eC.checkIsOnDemandRevalidate)(e10, f2.preview), D2 = false;
    if (t10) {
        let { tryGetPreviewData: n11 } = r("./dist/esm/server/api-utils/node/try-get-preview-data.js");
        D2 = false !== (u2 = n11(e10, t10, f2.preview, !!i2));
    }
    let N2 = null == (a2 = n6[n8]) ? void 0 : a2[this.projectDir], I2 = (null == N2 ? void 0 : N2.nextConfig) || h2.config, M2 = (0, eQ.w)(n10), $2 = B(e10, "rewroteURL") || M2;
    nz($2) && C2 && ($2 = S2.interpolateDynamicPath($2, C2)), "/index" === $2 && ($2 = "/");
    try {
        $2 = $2.split("/").map((e11) => {
        try {
            var t11;
            t11 = decodeURIComponent(e11), e11 = t11.replace(RegExp("([/#?]|%(2f|23|3f|5c))", "gi"), (e12) => encodeURIComponent(e12));
        } catch (e12) {
            throw Object.defineProperty(new rX("Failed to decode path param(s)."), "__NEXT_ERROR_CODE", { value: "E539", enumerable: false, configurable: true });
        }
        return e11;
        }).join("/");
    } catch (e11) {
    }
    return $2 = (0, X.Q)($2), { query: T2, originalQuery: _2, originalPathname: b2, params: C2, parsedUrl: y2, locale: R2, isNextDataRequest: v2, locales: null == m2 ? void 0 : m2.locales, defaultLocale: E2, isDraftMode: D2, previewData: u2, pageIsDynamic: w2, resolvedPathname: $2, isOnDemandRevalidate: O2, revalidateOnlyGenerated: A2, ...c2, serverActionsManifest: c2.serverActionsManifest, clientReferenceManifest: c2.clientReferenceManifest, nextConfig: I2, routerServerContext: N2 };
    }
    getResponseCache(e10) {
    if (!this.responseCache) {
        let t10 = B(e10, "minimalMode") ?? false;
        this.responseCache = new rp(t10);
    }
    return this.responseCache;
    }
    async handleResponse({ req: e10, nextConfig: t10, cacheKey: r10, routeKind: n10, isFallback: i2, prerenderManifest: a2, isRoutePPREnabled: s2, isOnDemandRevalidate: o2, revalidateOnlyGenerated: l2, responseGenerator: u2, waitUntil: c2 }) {
    let d2 = this.getResponseCache(e10), f2 = await d2.get(r10, u2, { routeKind: n10, isFallback: i2, isRoutePPREnabled: s2, isOnDemandRevalidate: o2, isPrefetch: "prefetch" === e10.headers.purpose, incrementalCache: await this.getIncrementalCache(e10, t10, a2), waitUntil: c2 });
    if (!f2 && r10 && !(o2 && l2)) throw Object.defineProperty(Error("invariant: cache entry required but not generated"), "__NEXT_ERROR_CODE", { value: "E62", enumerable: false, configurable: true });
    return f2;
    }
}
`;

test("patch the createSnapshot function", () => {
	expect(
		computePatchDiff(
			"app-page.runtime.prod.js",
			code,
			getIncrementalCacheRule(".open-next/server-functions/default/cache.cjs")
		)
	).toMatchInlineSnapshot(`
		"Index: app-page.runtime.prod.js
		===================================================================
		--- app-page.runtime.prod.js
		+++ app-page.runtime.prod.js
		@@ -3,9 +3,10 @@
		     this.userland = e10, this.definition = t10, this.isDev = false, this.distDir = r10, this.projectDir = n10;
		     }
		     async getIncrementalCache(e10, t10, n10) {
		     {
		-        let i2, { cacheHandler: a2 } = t10;
		+        const a2 = null;
		+let i2 = require('.open-next/server-functions/default/cache.cjs').default;
		         if (a2) {
		         let { formatDynamicImportPath: e11 } = r("./dist/esm/lib/format-dynamic-import-path.js");
		         i2 = rn(await n5(e11(this.distDir, a2)));
		         }
		"
	`);
});

test("force trustHostHeader to true", () => {
	const code = `
async function e9(e, t, r, n) {
    o.push("x-vercel-protection-bypass");
    try {
        if (n.trustHostHeader) {
            let n = await fetch(\`https://\${r.headers.host}\${e}\`, {
                    method: "HEAD",
                    headers: s
                });
        } else {
            throw Object.defineProperty(Error("Invariant: missing internal router-server-methods this is an internal bug"), "__NEXT_ERROR_CODE", {
            value: "E676",
            enumerable: !1,
            configurable: !0
        })
    }
    } catch (t) {
        throw Object.defineProperty(Error(\`Failed to revalidate \${e}: \${e4(t)?t.message:t}\`), "__NEXT_ERROR_CODE", {
            value: "E240",
            enumerable: !1,
            configurable: !0
        })
    }
}
`;

	expect(computePatchDiff("pages-api.runtime.prod.js", code, forceTrustHostHeader)).toMatchInlineSnapshot(`
		"Index: pages-api.runtime.prod.js
		===================================================================
		--- pages-api.runtime.prod.js
		+++ pages-api.runtime.prod.js
		@@ -1,8 +1,7 @@
		-
		-async function e9(e, t, r, n) {
		-    o.push("x-vercel-protection-bypass");
		-    try {
		+async function e9(e,t,r,n) {
		+  n.trustHostHeader = true;
		+  o.push("x-vercel-protection-bypass");try {
		         if (n.trustHostHeader) {
		             let n = await fetch(\`https://\${r.headers.host}\${e}\`, {
		                     method: "HEAD",
		                     headers: s
		"
	`);
});
