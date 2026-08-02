import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  createFactoryRelativePathConverter,
  getFactoryRootDir,
  getFactoryPaths,
  getUpstreamOutputRoot,
} from "../lib/factory-utils.js";

describe("createFactoryRelativePathConverter", () => {
  it("converts absolute paths to factory-relative paths", () => {
    const appRoot = path.join("C:", "factory", "0-harvest");
    const convert = createFactoryRelativePathConverter(appRoot);
    const result = convert(path.join("C:", "factory", "0-harvest", "file.ts"));
    expect(result).toBe("0-harvest/file.ts");
  });

  it("returns '.' for the factory root itself", () => {
    const appRoot = path.join("C:", "factory", "0-harvest");
    const convert = createFactoryRelativePathConverter(appRoot);
    const factoryRoot = path.join("C:", "factory");
    expect(convert(factoryRoot)).toBe(".");
  });

  it("normalizes backslashes to forward slashes", () => {
    const appRoot = path.join("C:", "factory", "my-app");
    const convert = createFactoryRelativePathConverter(appRoot);
    const result = convert(path.join("C:", "factory", "my-app", "sub", "file.ts"));
    expect(result).not.toContain("\\");
  });
});

describe("getFactoryRootDir", () => {
  it("returns parent of app root", () => {
    const appRoot = path.join("C:", "factory", "0-harvest");
    const result = getFactoryRootDir(appRoot);
    expect(result).toMatch(/factory$/);
  });
});

describe("getFactoryPaths", () => {
  it("returns standard path configuration", () => {
    const appRoot = path.join("C:", "factory", "0-harvest");
    const scriptDir = path.join(appRoot, "run");
    const paths = getFactoryPaths(appRoot, scriptDir, "device-1");

    expect(paths.inputDir).toMatch(/\.input$/);
    expect(paths.briefInputDir).toMatch(/0-harvest.*\.input$/);
    expect(paths.outputRootDir).toMatch(/\.output.*device-1$/);
    expect(paths.evidenceDir).toMatch(/\.evidence.*device-1$/);
    expect(paths.promptsDir).toMatch(/prompts$/);
    expect(paths.factoryRootDir).toMatch(/factory$/);
  });
});

describe("getUpstreamOutputRoot", () => {
  it("joins factory root with phase name and .output", () => {
    const factoryRoot = path.join("C:", "factory");
    const result = getUpstreamOutputRoot(factoryRoot, "0-harvest-source");
    expect(result).toMatch(/0-harvest-source.*\.output$/);
  });
});
