import { expect, it, vi } from "vitest";

const loadWrangler = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("wrangler", loadWrangler);

it("loads the cache command without importing Wrangler", async () => {
	await import("./populate-cache.js");

	expect(loadWrangler).not.toHaveBeenCalled();
});
