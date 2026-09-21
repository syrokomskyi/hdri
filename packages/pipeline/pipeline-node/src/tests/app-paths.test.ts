import { describe, it, expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAppPaths } from "../lib/app-paths.js";

const testModuleUrl = pathToFileURL(
  path.join("C:", "home", "user", "my-app", "run", "main.ts"),
).href;

describe("createAppPaths", () => {
  it("resolves paths from a module URL", () => {
    const paths = createAppPaths({ moduleUrl: testModuleUrl });
    expect(paths.scriptDir).toMatch(/run$/);
    expect(paths.rootDir).toMatch(/my-app$/);
    expect(paths.inputDir).toMatch(/\.input$/);
    expect(paths.outputRootDir).toMatch(/\.output$/);
    expect(paths.promptsDir).toMatch(/prompts$/);
  });

  it("places promptsDir in script dir by default", () => {
    const paths = createAppPaths({ moduleUrl: testModuleUrl });
    expect(paths.promptsDir).toMatch(/run[\\/]prompts$/);
  });

  it("places promptsDir in input dir when location is 'input'", () => {
    const paths = createAppPaths({
      moduleUrl: testModuleUrl,
      promptsDirLocation: "input",
    });
    expect(paths.promptsDir).toMatch(/\.input[\\/]prompts$/);
  });

  it("rootDir is one level up from scriptDir", () => {
    const paths = createAppPaths({ moduleUrl: testModuleUrl });
    expect(paths.rootDir).toMatch(/my-app$/);
  });
});
