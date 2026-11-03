import pm from "picomatch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalPattern } from "./images.js";
import {
	detectImageContentType,
	handleCdnCgiImageRequest,
	handleImageRequest,
	matchLocalPattern,
	matchRemotePattern as mRP,
	parseCdnCgiImageRequest,
} from "./images.js";

/**
 * See https://github.com/vercel/next.js/blob/64702a9/test/unit/image-optimizer/match-remote-pattern.test.ts
 */
describe("matchRemotePattern", () => {
	it("should match literal hostname", () => {
		const p = { hostname: pm.makeRe("example.com") } as const;
		expect(mRP(p, new URL("https://example.com"))).toBe(true);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://example.net"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/path/to"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(true);
		expect(mRP(p, new URL("http://example.com:81/path/to/file"))).toBe(true);
	});

	it("should match literal protocol and hostname", () => {
		const p = { protocol: "https", hostname: pm.makeRe("example.com") } as const;
		expect(mRP(p, new URL("https://example.com"))).toBe(true);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(true);
		expect(mRP(p, new URL("http://example.com:81/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com:81/path/to/file"))).toBe(false);
	});

	it("should match literal protocol, hostname, no port", () => {
		const p = { protocol: "https", hostname: pm.makeRe("example.com"), port: "" } as const;
		expect(mRP(p, new URL("https://example.com"))).toBe(true);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/path/to/file?q=1"))).toBe(true);
		expect(mRP(p, new URL("http://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("http://example.com:81/path/to/file"))).toBe(false);
	});

	it("should match literal protocol, hostname, no port, no search", () => {
		const p = {
			protocol: "https",
			hostname: pm.makeRe("example.com"),
			port: "",
			search: "",
		} as const;
		expect(mRP(p, new URL("https://example.com"))).toBe(true);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("http://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("http://example.com:81/path/to/file"))).toBe(false);
	});

	it("should match literal protocol, hostname, port 42", () => {
		const p = {
			protocol: "https",
			hostname: pm.makeRe("example.com"),
			port: "42",
		} as const;
		expect(mRP(p, new URL("https://example.com:42"))).toBe(true);
		expect(mRP(p, new URL("https://example.com.uk:42"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com:42"))).toBe(false);
		expect(mRP(p, new URL("https://com:42"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1"))).toBe(true);
		expect(mRP(p, new URL("http://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("http://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(false);
	});

	it("should match literal protocol, hostname, port, pathname", () => {
		const p = {
			protocol: "https",
			hostname: pm.makeRe("example.com"),
			port: "42",
			pathname: pm.makeRe("/path/to/file", { dot: true }),
		} as const;
		expect(mRP(p, new URL("https://example.com:42"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk:42"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com:42"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1"))).toBe(true);
		expect(mRP(p, new URL("http://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("http://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(false);
	});

	it("should match literal protocol, hostname, port, pathname, search", () => {
		const p = {
			protocol: "https",
			hostname: pm.makeRe("example.com"),
			port: "42",
			pathname: pm.makeRe("/path/to/file", { dot: true }),
			search: "?q=1&a=two&s=!@$^&-_+/()[]{};:~",
		} as const;
		expect(mRP(p, new URL("https://example.com:42"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk:42"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com:42"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("http://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com:42/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("http://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("ftp://example.com/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:81/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1&a=two"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1&a=two&s"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1&a=two&s="))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1&a=two&s=!@"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1&a=two&s=!@$^&-_+/()[]{};:~"))).toBe(true);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?q=1&s=!@$^&-_+/()[]{};:~&a=two"))).toBe(false);
		expect(mRP(p, new URL("https://example.com:42/path/to/file?a=two&q=1&s=!@$^&-_+/()[]{};:~"))).toBe(false);
	});

	it("should match hostname pattern with single asterisk by itself", () => {
		const p = { hostname: pm.makeRe("avatars.*.example.com") } as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://avatars.iad1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://more.avatars.iad1.example.com"))).toBe(false);
	});

	it("should match hostname pattern with single asterisk at beginning", () => {
		const p = { hostname: pm.makeRe("avatars.*1.example.com") } as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://avatars.iad1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://more.avatars.iad1.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo2.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.iad2.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.1.example.com"))).toBe(true);
	});

	it("should match hostname pattern with single asterisk in middle", () => {
		const p = { hostname: pm.makeRe("avatars.*a*.example.com") } as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo1.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.iad1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://more.avatars.iad1.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo2.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.iad2.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://avatars.a.example.com"))).toBe(true);
	});

	it("should match hostname pattern with single asterisk at end", () => {
		const p = { hostname: pm.makeRe("avatars.ia*.example.com") } as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo1.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.iad1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://more.avatars.iad1.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.sfo2.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.iad2.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://avatars.ia.example.com"))).toBe(true);
	});

	it("should match hostname pattern with double asterisk", () => {
		const p = { hostname: pm.makeRe("**.example.com") } as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://deep.sub.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://avatars.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://avatars.sfo1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://avatars.iad1.example.com"))).toBe(true);
		expect(mRP(p, new URL("https://more.avatars.iad1.example.com"))).toBe(true);
	});

	it("should match pathname pattern with single asterisk by itself", () => {
		const p = {
			hostname: pm.makeRe("example.com"),
			pathname: pm.makeRe("/act123/*/pic.jpg", { dot: true }),
		} as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/picsjpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr5/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr6/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/team/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act456/team/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/.a/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/team/usr4/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/team/pic.jpg"))).toBe(false);
	});

	it("should match pathname pattern with single asterisk at the beginning", () => {
		const p = {
			hostname: pm.makeRe("example.com"),
			pathname: pm.makeRe("/act123/*4/pic.jpg", { dot: true }),
		} as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/picsjpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr5/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/team4/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act456/team5/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/team/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/4/pic.jpg"))).toBe(true);
	});

	it("should match pathname pattern with single asterisk in the middle", () => {
		const p = {
			hostname: pm.makeRe("example.com"),
			pathname: pm.makeRe("/act123/*sr*/pic.jpg", { dot: true }),
		} as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/picsjpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr5/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/.sr6/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/team4/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/team5/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/team/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/sr/pic.jpg"))).toBe(true);
	});

	it("should match pathname pattern with single asterisk at the end", () => {
		const p = {
			hostname: pm.makeRe("example.com"),
			pathname: pm.makeRe("/act123/usr*/pic.jpg", { dot: true }),
		} as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/picsjpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr5/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/team4/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act456/team5/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/team/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com/act123/usr6/pic.jpg"))).toBe(false);
	});

	it("should match pathname pattern with double asterisk", () => {
		const p = {
			hostname: pm.makeRe("example.com"),
			pathname: pm.makeRe("/act123/**", { dot: true }),
		} as const;
		expect(mRP(p, new URL("https://com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com"))).toBe(false);
		expect(mRP(p, new URL("https://example.com.uk"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/act123"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr4"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr4/picsjpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr4/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr5/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/usr6/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/team/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/.a/pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act123/team/.pic.jpg"))).toBe(true);
		expect(mRP(p, new URL("https://example.com/act456/team/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://example.com/team/pic.jpg"))).toBe(false);
		expect(mRP(p, new URL("https://sub.example.com/act123/team/pic.jpg"))).toBe(false);
	});

	it("should throw when hostname is missing", () => {
		const p = { protocol: "https" } as const;
		// @ts-ignore testing invalid input
		expect(mRP(p, new URL("https://example.com"))).toBe(false);
	});
});

/**
 * See https://github.com/vercel/next.js/blob/64702a9/test/unit/image-optimizer/match-local-pattern.test.ts
 */
describe("matchLocalPattern", () => {
	const mLP = (p: LocalPattern, urlPathAndQuery: string) =>
		matchLocalPattern(p, new URL(urlPathAndQuery, "http://n"));

	it("should match anything when no pattern is defined", () => {
		const p = {} as const;
		expect(mLP(p, "/")).toBe(true);
		expect(mLP(p, "/path")).toBe(true);
		expect(mLP(p, "/path/to")).toBe(true);
		expect(mLP(p, "/path/to/file")).toBe(true);
		expect(mLP(p, "/path/to/file.txt")).toBe(true);
		expect(mLP(p, "/path/to/file?q=1")).toBe(true);
		expect(mLP(p, "/path/to/file?q=1&a=two")).toBe(true);
	});

	it("should match any path without a search query string", () => {
		const p = {
			search: "",
		} as const;
		expect(mLP(p, "/")).toBe(true);
		expect(mLP(p, "/path")).toBe(true);
		expect(mLP(p, "/path/to")).toBe(true);
		expect(mLP(p, "/path/to/file")).toBe(true);
		expect(mLP(p, "/path/to/file.txt")).toBe(true);
		expect(mLP(p, "/path/to/file?q=1")).toBe(false);
		expect(mLP(p, "/path/to/file?q=1&a=two")).toBe(false);
		expect(mLP(p, "/path/to/file.txt?q=1&a=two")).toBe(false);
	});

	it("should match literal pathname and any search query string", () => {
		const p = {
			pathname: pm.makeRe("/path/to/file", {
				dot: true,
			}),
		} as const;
		expect(mLP(p, "/")).toBe(false);
		expect(mLP(p, "/path")).toBe(false);
		expect(mLP(p, "/path/to")).toBe(false);
		expect(mLP(p, "/path/to/file")).toBe(true);
		expect(mLP(p, "/path/to/file.txt")).toBe(false);
		expect(mLP(p, "/path/to/file?q=1")).toBe(true);
		expect(mLP(p, "/path/to/file?q=1&a=two")).toBe(true);
		expect(mLP(p, "/path/to/file.txt?q=1&a=two")).toBe(false);
	});

	it("should match pathname with double asterisk", () => {
		const p = {
			pathname: pm.makeRe("/path/to/**", {
				dot: true,
			}),
		} as const;
		expect(mLP(p, "/")).toBe(false);
		expect(mLP(p, "/path")).toBe(false);
		expect(mLP(p, "/path/to")).toBe(true);
		expect(mLP(p, "/path/to/file")).toBe(true);
		expect(mLP(p, "/path/to/file.txt")).toBe(true);
		expect(mLP(p, "/path/to/file?q=1")).toBe(true);
		expect(mLP(p, "/path/to/file?q=1&a=two")).toBe(true);
		expect(mLP(p, "/path/to/file.txt?q=1&a=two")).toBe(true);
	});
});

describe("parseCdnCgiImageRequest", () => {
	it("should parse a valid local image request", () => {
		const result = parseCdnCgiImageRequest(
			"/cdn-cgi/image/width=640,quality=75,format=auto/_next/static/media/photo.png"
		);
		expect(result).toEqual({ ok: true, url: "/_next/static/media/photo.png", static: false });
	});

	it("should parse a valid remote image request", () => {
		const result = parseCdnCgiImageRequest(
			"/cdn-cgi/image/width=1080,quality=75,format=auto/https://example.com/photo.jpg"
		);
		expect(result).toEqual({ ok: true, url: "https://example.com/photo.jpg", static: false });
	});

	it("should reject when pathname does not match /cdn-cgi/image/ format", () => {
		const result = parseCdnCgiImageRequest("/cdn-cgi/image/");
		expect(result).toEqual({ ok: false, message: "Invalid /cdn-cgi/image/ URL format" });
	});

	it("should reject when options segment has no trailing image URL", () => {
		const result = parseCdnCgiImageRequest("/cdn-cgi/image/width=640");
		expect(result).toEqual({ ok: false, message: "Invalid /cdn-cgi/image/ URL format" });
	});

	it("should reject protocol-relative URLs", () => {
		const result = parseCdnCgiImageRequest(
			"/cdn-cgi/image/width=640,quality=75,format=auto//evil.com/photo.jpg"
		);
		expect(result).toEqual({
			ok: false,
			message: '"url" parameter cannot be a protocol-relative URL (//)',
		});
	});

	it("should add leading slash to relative image URLs", () => {
		const result = parseCdnCgiImageRequest(
			"/cdn-cgi/image/width=640,quality=75,format=auto/path/to/image.png"
		);
		expect(result).toMatchObject({ ok: true, url: "/path/to/image.png" });
	});
});

describe("detectImageContentType", () => {
	it("should detect JPEG", () => {
		const buffer = new Uint8Array(32);
		buffer[0] = 0xff;
		buffer[1] = 0xd8;
		buffer[2] = 0xff;
		expect(detectImageContentType(buffer)).toBe("image/jpeg");
	});

	it("should detect PNG", () => {
		const buffer = new Uint8Array(32);
		const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		pngHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/png");
	});

	it("should detect GIF", () => {
		const buffer = new Uint8Array(32);
		const gifHeader = [0x47, 0x49, 0x46, 0x38];
		gifHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/gif");
	});

	it("should detect WebP", () => {
		const buffer = new Uint8Array(32);
		// RIFF....WEBP
		const webpHeader = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
		webpHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/webp");
	});

	it("should detect SVG (<?xml prefix)", () => {
		const buffer = new Uint8Array(32);
		const svgHeader = [0x3c, 0x3f, 0x78, 0x6d, 0x6c];
		svgHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/svg+xml");
	});

	it("should detect SVG (<svg prefix)", () => {
		const buffer = new Uint8Array(32);
		const svgHeader = [0x3c, 0x73, 0x76, 0x67];
		svgHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/svg+xml");
	});

	it("should detect AVIF", () => {
		const buffer = new Uint8Array(32);
		// Bytes 0-3 are the big-endian size of the ftyp box (0x1c)
		const avifHeader = [0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
		avifHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/avif");
	});

	it("should detect AVIF from a real header", () => {
		// First 32 bytes of next.js test/unit/image-optimizer/images/test.avif
		const buffer = new Uint8Array([
			0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x61,
			0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31, 0x6d, 0x69, 0x61, 0x66, 0x4d, 0x41, 0x31, 0x42,
		]);
		expect(detectImageContentType(buffer)).toBe("image/avif");
	});

	it("should detect HEIC from a real header", () => {
		// First 32 bytes of next.js test/unit/image-optimizer/images/test.heic
		const buffer = new Uint8Array([
			0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00, 0x6d,
			0x69, 0x66, 0x31, 0x4d, 0x69, 0x50, 0x72, 0x6d, 0x69, 0x61, 0x66, 0x4d, 0x69, 0x48, 0x42,
		]);
		expect(detectImageContentType(buffer)).toBe("image/heic");
	});

	it("should not return avif or heic for svg prefixed with an ftyp-looking comment", () => {
		// The comment places "ftypavif"/"ftypheic" at byte offset 4 where the
		// ISOBMFF signature looks for it. The prefixed box size is not plausible
		// so the buffer must not be detected as AVIF/HEIC.
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>`;
		for (const brand of ["avif", "heic"]) {
			const buffer = new TextEncoder().encode(`<!--ftyp${brand}-->\n${svg}`).slice(0, 32);
			expect(detectImageContentType(buffer)).toBeNull();
		}
	});

	it.each([
		["zero", 0x00000000],
		["too small", 0x0000000f],
		["too large", 0x00001001],
	])("should not detect AVIF or HEIC when the ftyp box size is %s", (_, boxSize) => {
		for (const brand of ["avif", "heic"]) {
			const buffer = new Uint8Array(32);
			new DataView(buffer.buffer).setUint32(0, boxSize);
			buffer.set(new TextEncoder().encode(`ftyp${brand}`), 4);
			expect(detectImageContentType(buffer)).toBeNull();
		}
	});

	it.each([
		["minimum", 0x00000010],
		["maximum", 0x00001000],
	])("should detect AVIF and HEIC when the ftyp box size is the %s", (_, boxSize) => {
		for (const brand of ["avif", "heic"]) {
			const buffer = new Uint8Array(32);
			new DataView(buffer.buffer).setUint32(0, boxSize);
			buffer.set(new TextEncoder().encode(`ftyp${brand}`), 4);
			expect(detectImageContentType(buffer)).toBe(`image/${brand}`);
		}
	});

	it("should not detect AVIF or HEIC when the buffer is too short", () => {
		const buffer = new Uint8Array([0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69]);
		expect(detectImageContentType(buffer)).toBeNull();
	});

	it("should detect AVIF from a subarray", () => {
		const buffer = new Uint8Array(40);
		buffer.set([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 8);
		expect(detectImageContentType(buffer.subarray(8))).toBe("image/avif");
	});

	it("should detect ICO", () => {
		const buffer = new Uint8Array(32);
		const icoHeader = [0x00, 0x00, 0x01, 0x00];
		icoHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/x-icon");
	});

	it("should detect TIFF", () => {
		const buffer = new Uint8Array(32);
		const tiffHeader = [0x49, 0x49, 0x2a, 0x00];
		tiffHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/tiff");
	});

	it("should detect BMP", () => {
		const buffer = new Uint8Array(32);
		buffer[0] = 0x42;
		buffer[1] = 0x4d;
		expect(detectImageContentType(buffer)).toBe("image/bmp");
	});

	it("should detect JXL (short signature)", () => {
		const buffer = new Uint8Array(32);
		buffer[0] = 0xff;
		buffer[1] = 0x0a;
		expect(detectImageContentType(buffer)).toBe("image/jxl");
	});

	it("should detect JXL (long signature)", () => {
		const buffer = new Uint8Array(32);
		const jxlHeader = [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];
		jxlHeader.forEach((b, i) => (buffer[i] = b));
		expect(detectImageContentType(buffer)).toBe("image/jxl");
	});

	it("should return null for unknown content", () => {
		const buffer = new Uint8Array(32);
		buffer.fill(0x00);
		buffer[0] = 0x01;
		buffer[1] = 0x02;
		buffer[2] = 0x03;
		expect(detectImageContentType(buffer)).toBeNull();
	});
});

describe("handleImageRequest", () => {
	const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	const GIF_HEADER = [0x47, 0x49, 0x46, 0x38];

	/**
	 * Creates the env for an image request.
	 *
	 * @param sourceHeader The first bytes of the source image, used to detect its content type.
	 * @param producedContentType The content type of the image produced by the Images binding.
	 * @returns The env and a spy on the `output()` method of the Images binding.
	 */
	function createEnv(sourceHeader: number[], producedContentType: string) {
		const headerBytes = new Uint8Array(32);
		headerBytes.set(sourceHeader);
		// Note: `readAtLeast()` is only available in workerd.
		const headerStream = { getReader: () => ({ readAtLeast: async () => ({ value: headerBytes }) }) };
		const imageResponse = {
			ok: true,
			status: 200,
			headers: new Headers(),
			body: { tee: () => [headerStream, new ReadableStream()] },
		};

		const output = vi.fn(async () => ({
			contentType: () => producedContentType,
			image: () => new ReadableStream(),
		}));
		const env = {
			ASSETS: { fetch: async () => imageResponse },
			IMAGES: { input: () => ({ transform: () => ({ output }) }) },
		} as unknown as CloudflareEnv;

		return { env, output };
	}

	// Note: static assets are not matched against the local patterns.
	const requestURL = new URL(
		"https://example.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fimage.png&w=640&q=75"
	);

	beforeEach(() => {
		vi.stubGlobal("__NEXT_BASE_PATH__", "");
		vi.stubGlobal("__IMAGES_DEVICE_SIZES__", [640]);
		vi.stubGlobal("__IMAGES_IMAGE_SIZES__", []);
		vi.stubGlobal("__IMAGES_QUALITIES__", [75]);
		vi.stubGlobal("__IMAGES_FORMATS__", ["image/avif", "image/webp"]);
		vi.stubGlobal("__IMAGES_CONTENT_DISPOSITION__", "attachment");
		vi.stubGlobal("__IMAGES_CONTENT_SECURITY_POLICY__", "script-src 'none'");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("should use the requested format as the content type when the binding produces it", async () => {
		const { env, output } = createEnv(PNG_HEADER, "image/avif");

		const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/avif" }), env);

		expect(output).toHaveBeenCalledWith({ quality: 75, format: "image/avif" });
		expect(response.headers.get("Content-Type")).toBe("image/avif");
	});

	it("should use the produced format as the content type when the binding falls back", async () => {
		const { env, output } = createEnv(PNG_HEADER, "image/webp");

		const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/avif" }), env);

		expect(output).toHaveBeenCalledWith({ quality: 75, format: "image/avif" });
		expect(response.headers.get("Content-Type")).toBe("image/webp");
	});

	it("should use the produced format as the content type for GIF images", async () => {
		const { env, output } = createEnv(GIF_HEADER, "image/webp");

		const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/avif" }), env);

		expect(output).toHaveBeenCalledWith({ quality: 75, format: "image/gif" });
		expect(response.headers.get("Content-Type")).toBe("image/webp");
	});

	// Port of next.js test/e2e/app-dir/avif-svg-signature-confusion
	describe("avif-svg-signature-confusion", () => {
		/**
		 * Returns the first bytes of the UTF-8 encoding of a text, as used by `createEnv()`.
		 *
		 * @param text The text to encode.
		 * @returns The first 32 bytes of the encoded text.
		 */
		function textHeader(text: string): number[] {
			return Array.from(new TextEncoder().encode(text).slice(0, 32));
		}

		// An ordinary SVG document, served with no trick prefix.
		const CONTROL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect width="100" height="100" fill="red"/>
</svg>
`;

		// A valid SVG document that begins with the HTML comment `<!--ftypavif-->`.
		// The byte sequence "ftypavif" lands at byte offset 4, which is exactly where
		// the AVIF magic-byte signature looks for it.
		const EVIL_AVIF_SVG = `<!--ftypavif-->
${CONTROL_SVG}`;

		const EVIL_HEIC_SVG = `<!--ftypheic-->
${CONTROL_SVG}`;

		const AVIF_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];

		beforeEach(() => {
			vi.stubGlobal("__IMAGES_ALLOW_SVG__", false);
		});

		it("rejects an ordinary SVG when dangerouslyAllowSVG is false", async () => {
			const { env, output } = createEnv(textHeader(CONTROL_SVG), "image/webp");

			const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/webp" }), env);

			expect(response.status).toBe(400);
			expect(await response.text()).toContain("image type is not allowed");
			expect(output).not.toHaveBeenCalled();
		});

		it.each([
			["<!--ftypavif-->", EVIL_AVIF_SVG],
			["<!--ftypheic-->", EVIL_HEIC_SVG],
		])("rejects an SVG prefixed with %s", async (_, svg) => {
			const { env, output } = createEnv(textHeader(svg), "image/webp");

			const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/webp" }), env);

			expect(response.status).toBe(400);
			expect(await response.text()).toContain("image type is not allowed");
			expect(output).not.toHaveBeenCalled();
		});

		it("rejects an SVG prefixed with <!--ftypavif--> when the IMAGES binding is not defined", async () => {
			const { env } = createEnv(textHeader(EVIL_AVIF_SVG), "image/webp");
			delete (env as { IMAGES?: unknown }).IMAGES;

			const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/webp" }), env);

			expect(response.status).toBe(400);
			expect(await response.text()).toContain("image type is not allowed");
		});

		it("rejects an SVG prefixed with <!--ftypavif--> when dangerouslyAllowSVG is true", async () => {
			// The content is not detected as SVG nor AVIF.
			vi.stubGlobal("__IMAGES_ALLOW_SVG__", true);
			const { env, output } = createEnv(textHeader(EVIL_AVIF_SVG), "image/webp");

			const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/webp" }), env);

			expect(response.status).toBe(400);
			expect(await response.text()).toContain("image type is not allowed");
			expect(output).not.toHaveBeenCalled();
		});

		it("still optimizes an AVIF image", async () => {
			const { env, output } = createEnv(AVIF_HEADER, "image/webp");

			const response = await handleImageRequest(requestURL, new Headers({ Accept: "image/webp" }), env);

			expect(response.status).toBe(200);
			expect(output).toHaveBeenCalledWith({ quality: 75, format: "image/webp" });
			expect(response.headers.get("Content-Type")).toBe("image/webp");
		});

		it.each([
			["an ordinary SVG", CONTROL_SVG],
			["an SVG prefixed with <!--ftypheic-->", EVIL_HEIC_SVG],
		])("rejects %s on /cdn-cgi/image/ when dangerouslyAllowSVG is false", async (_, svg) => {
			// Note: HEIC is a supported input format for /cdn-cgi/image/, AVIF is not.
			const { env } = createEnv(textHeader(svg), "image/webp");

			const response = await handleCdnCgiImageRequest(
				new URL("https://example.com/cdn-cgi/image/width=640/image.png"),
				env
			);

			expect(response.status).toBe(400);
			expect(await response.text()).toContain("image type is not allowed");
		});
	});
});
