/**
 * This solves the fact that the workerd URL parsing is not compatible with the node.js one
 * VERY IMPORTANT: this required the following dependency to be part of the application!!!! (this is very bad!!!)
 *    "node-url": "npm:url@^0.11.4"
 * Hopefully this should not be necessary after this unenv PR lands: https://github.com/unjs/unenv/pull/292
 */
export function patchUrl(code: string): string {
	return code.replace(
		/ ([a-zA-Z0-9_]+) = require\("url"\);/g,
		` $1 = require("url");
      const nodeUrl = require("node-url");
      $1.parse = nodeUrl.parse.bind(nodeUrl);
      $1.format = nodeUrl.format.bind(nodeUrl);
      $1.pathToFileURL = (path) => {
        console.log("url.pathToFileURL", path);
        return new URL("file://" + path);
      }
    `
	);
}
