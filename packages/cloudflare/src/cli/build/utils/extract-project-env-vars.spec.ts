import { appendFileSync, writeFileSync } from "node:fs";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";
import mockFs from "mock-fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractProjectEnvVars } from "./extract-project-env-vars.js";

const options = { monorepoRoot: "", appPath: "" } as BuildOptions;

describe("extractProjectEnvVars", () => {
  beforeEach(() => {
    mockFs({
      ".env": "ENV_VAR=value",
      ".env.local": "ENV_LOCAL_VAR=value",
      ".env.test": "ENV_TEST_VAR=value",
      ".env.test.local": "ENV_TEST_LOCAL_VAR=value",
      ".env.development": "ENV_DEV_VAR=value",
      ".env.development.local": "ENV_DEV_LOCAL_VAR=value",
      ".env.production": "ENV_PROD_VAR=value",
      ".env.production.local": "ENV_PROD_LOCAL_VAR=value",
    });
  });

  afterEach(() => mockFs.restore());

  it("should extract production env vars", () => {
    const result = extractProjectEnvVars("production", options);
    expect(result).toEqual({
      ENV_LOCAL_VAR: "value",
      ENV_PROD_LOCAL_VAR: "value",
      ENV_PROD_VAR: "value",
      ENV_VAR: "value",
    });
  });

  it("should extract development env vars", () => {
    writeFileSync(".dev.vars", 'NEXTJS_ENV = "development"');

    const result = extractProjectEnvVars("development", options);
    expect(result).toEqual({
      ENV_LOCAL_VAR: "value",
      ENV_DEV_LOCAL_VAR: "value",
      ENV_DEV_VAR: "value",
      ENV_VAR: "value",
    });
  });

  it("should override env vars with those in a local file", () => {
    writeFileSync(".env.production.local", "ENV_PROD_VAR=overridden");

    const result = extractProjectEnvVars("production", options);
    expect(result).toEqual({
      ENV_LOCAL_VAR: "value",
      ENV_PROD_VAR: "overridden",
      ENV_VAR: "value",
    });
  });

  it("should support referencing variables", () => {
    appendFileSync(".env.production.local", "\nENV_PROD_LOCAL_VAR_REF=$ENV_PROD_LOCAL_VAR");

    const result = extractProjectEnvVars("production", options);
    expect(result).toEqual({
      ENV_LOCAL_VAR: "value",
      ENV_PROD_LOCAL_VAR: "value",
      ENV_PROD_LOCAL_VAR_REF: "value",
      ENV_PROD_VAR: "value",
      ENV_VAR: "value",
    });
  });

  it("should exclude .env.local files when extracting test env vars", () => {
    const result = extractProjectEnvVars("test", options);
    expect(result).toEqual({
      ENV_TEST_LOCAL_VAR: "value",
      ENV_TEST_VAR: "value",
      ENV_VAR: "value",
    });
  });
});
