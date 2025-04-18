import { describe, expect, test } from "vitest";

import { hasBuildCondition } from "./workerd";

describe("hasBuildConditions", () => {
  test("undefined", () => {
    expect(hasBuildCondition(undefined, "workerd")).toBe(false);
  });

  test("top level", () => {
    const exports = {
      workerd: "./path/to/workerd.js",
      default: "./path/to/default.js",
    };

    expect(hasBuildCondition(exports, "workerd")).toBe(true);
    expect(hasBuildCondition(exports, "default")).toBe(true);
    expect(hasBuildCondition(exports, "module")).toBe(false);
  });

  test("nested", () => {
    const exports = {
      ".": "/path/to/index.js",
      "./server": {
        "react-server": {
          workerd: "./server.edge.js",
        },
        default: "./server.js",
      },
    };

    expect(hasBuildCondition(exports, "workerd")).toBe(true);
    expect(hasBuildCondition(exports, "default")).toBe(true);
    expect(hasBuildCondition(exports, "module")).toBe(false);
  });

  test("only consider leaves", () => {
    const exports = {
      ".": "/path/to/index.js",
      "./server": {
        workerd: {
          default: "./server.edge.js",
        },
      },
    };

    expect(hasBuildCondition(exports, "workerd")).toBe(false);
  });
});
