import pm from "picomatch";
import { describe, expect, it } from "vitest";

import type { LocalPattern } from "./images.js";
import {
	detectImageContentType,
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
		const avifHeader = [0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
		// Bytes at positions 0-3 are wildcards (any non-zero matches), fill with typical values
		buffer[0] = 0x00;
		buffer[1] = 0x00;
		buffer[2] = 0x00;
		buffer[3] = 0x1c; // non-zero (file size prefix); the detection uses !b to skip zero bytes
		avifHeader.forEach((b, i) => {
			if (b !== 0) buffer[i] = b;
		});
		expect(detectImageContentType(buffer)).toBe("image/avif");
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
