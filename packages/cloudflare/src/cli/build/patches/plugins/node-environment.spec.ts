import { describe, expect, test } from "vitest";

import { computePatchDiff } from "../../utils/test-patch.js";
import { errorInspectRule } from "./node-environment.js";

describe("NodeEnvironment", () => {
	const code = `
// This file should be imported before any others. It sets up the environment
// for later imports to work properly.
"use strict";
Object.defineProperty(exports, "__esModule", {
		value: true
});
require("./node-environment-baseline");
require("./node-environment-extensions/error-inspect");
require("./node-environment-extensions/random");
require("./node-environment-extensions/date");
require("./node-environment-extensions/web-crypto");
require("./node-environment-extensions/node-crypto");
if (process.env.NODE_ENV === 'development') {
		require('./node-environment-extensions/console-dev');
}

//# sourceMappingURL=node-environment.js.map
`;

	test("error inspect", () => {
		expect(computePatchDiff("node-environment.js", code, errorInspectRule)).toMatchInlineSnapshot(`
			"Index: node-environment.js
			===================================================================
			--- node-environment.js
			+++ node-environment.js
			@@ -1,13 +1,13 @@
			-
			 // This file should be imported before any others. It sets up the environment
			 // for later imports to work properly.
			 "use strict";
			 Object.defineProperty(exports, "__esModule", {
			 		value: true
			 });
			 require("./node-environment-baseline");
			-require("./node-environment-extensions/error-inspect");
			+// Removed by OpenNext
			+// require("./node-environment-extensions/error-inspect");
			 require("./node-environment-extensions/random");
			 require("./node-environment-extensions/date");
			 require("./node-environment-extensions/web-crypto");
			 require("./node-environment-extensions/node-crypto");
			"
		`);
	});
});
