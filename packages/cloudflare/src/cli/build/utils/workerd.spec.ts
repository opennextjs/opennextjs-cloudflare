import { describe, expect, test } from "vitest";

import { transformBuildCondition, transformPackageJson } from "./workerd.js";

describe("transformBuildCondition", () => {
	test("top level", () => {
		const exports = {
			workerd: "./path/to/workerd.js",
			default: "./path/to/default.js",
		};

		const workerd = transformBuildCondition(exports, "workerd");
		const defaultExport = transformBuildCondition(exports, "default");
		const moduleExport = transformBuildCondition(exports, "module");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			workerd: "./path/to/workerd.js",
		});
		expect(defaultExport.hasBuildCondition).toBe(true);
		expect(defaultExport.transformedExports).toEqual({
			default: "./path/to/default.js",
		});
		expect(moduleExport.hasBuildCondition).toBe(false);
		expect(moduleExport.transformedExports).toEqual({
			workerd: "./path/to/workerd.js",
			default: "./path/to/default.js",
		});
	});

	test("nested", () => {
		const exports = {
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
				default: "./server.js",
			},
		};

		const workerd = transformBuildCondition(exports, "workerd");
		const defaultExport = transformBuildCondition(exports, "default");
		const moduleExport = transformBuildCondition(exports, "module");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
				},
				default: "./server.js",
			},
		});

		expect(defaultExport.hasBuildCondition).toBe(true);
		expect(defaultExport.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				default: "./server.js",
			},
		});

		expect(moduleExport.hasBuildCondition).toBe(false);
		expect(moduleExport.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				"react-server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
				default: "./server.js",
			},
		});
	});

	test("object-valued condition", () => {
		const exports = {
			".": "/path/to/index.js",
			"./server": {
				workerd: {
					default: "./server.edge.js",
				},
			},
		};

		const workerd = transformBuildCondition(exports, "workerd");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			".": "/path/to/index.js",
			"./server": {
				workerd: {
					default: "./server.edge.js",
				},
			},
		});
	});

	test("preserve sibling subtree that nests the condition", () => {
		const exports = {
			"react-server": {
				workerd: "./rsc.edge.js",
			},
			workerd: "./top.edge.js",
		};

		const workerd = transformBuildCondition(exports, "workerd");

		expect(workerd.hasBuildCondition).toBe(true);
		expect(workerd.transformedExports).toEqual({
			"react-server": {
				workerd: "./rsc.edge.js",
			},
			workerd: "./top.edge.js",
		});
	});
});

describe("transformPackageJson", () => {
	test("no exports nor imports", () => {
		const json = {
			name: "test",
			main: "index.js",
			version: "1.0.0",
			description: "test package",
		};

		const { transformed, hasBuildCondition } = transformPackageJson(json);

		expect(transformed).toEqual(json);
		expect(hasBuildCondition).toBe(false);
	});

	test("exports only with no workerd condition", () => {
		const json = {
			name: "test",
			exports: {
				".": "./index.js",
				"./server": "./server.js",
			},
		};

		const { transformed, hasBuildCondition } = transformPackageJson(json);

		expect(transformed).toEqual(json);
		expect(hasBuildCondition).toBe(false);
	});

	test("exports only with nested workerd condition", () => {
		const json = {
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
				},
			},
		});
		expect(hasBuildCondition).toBe(true);
	});

	test("imports only with top level workerd condition", () => {
		const json = {
			name: "test",
			imports: {
				workerd: "./server.edge.js",
				default: "./server.js",
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "test",
			imports: {
				workerd: "./server.edge.js",
			},
		});
		expect(hasBuildCondition).toBe(true);
	});

	// https://github.com/opennextjs/opennextjs-cloudflare/issues/1153
	// Matches the exports field of pg-cloudflare@1.3.0.
	test("exports with object-valued workerd condition (pg-cloudflare)", () => {
		const json = {
			name: "pg-cloudflare",
			exports: {
				".": {
					workerd: {
						import: "./esm/index.mjs",
						require: "./dist/index.js",
					},
					default: "./dist/empty.js",
				},
				"./package.json": "./package.json",
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "pg-cloudflare",
			exports: {
				".": {
					workerd: {
						import: "./esm/index.mjs",
						require: "./dist/index.js",
					},
				},
				"./package.json": "./package.json",
			},
		});
		expect(hasBuildCondition).toBe(true);
	});

	test("exports and imports with workerd condition both nested and top level", () => {
		const json = {
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
					other: "./server.js",
				},
			},
			imports: {
				workerd: "./server.edge.js",
				default: "./server.js",
			},
		};
		const { transformed, hasBuildCondition } = transformPackageJson(json);
		expect(transformed).toEqual({
			name: "test",
			exports: {
				".": "./index.js",
				"./server": {
					workerd: "./server.edge.js",
				},
			},
			imports: {
				workerd: "./server.edge.js",
			},
		});
		expect(hasBuildCondition).toBe(true);
	});
});
