import pm from "picomatch";
import { describe, expect, it } from "vitest";

import type { LocalPattern } from "./images.js";
import { matchLocalPattern, matchRemotePattern as mRP } from "./images.js";

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
