import { describe, it, expect } from "vitest";
import { HandwerksradarParser } from "../../parsers/HandwerksradarParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new HandwerksradarParser();
const fixtureDir = join(__dirname, "fixtures", "handwerksradar.de");

describe("HandwerksradarParser", () => {
  it("parses CSV with multiple rows", () => {
    const content = readFileSync(join(fixtureDir, "detail-page.csv"), "utf8");
    const result = parser.parse(content, "detail-page.csv");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.businessName).toBeTruthy();
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("parses CSV with single row", () => {
    const content = readFileSync(join(fixtureDir, "detail-page-2.csv"), "utf8");
    const result = parser.parse(content, "detail-page-2.csv");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Testfirma Gamma");
  });
});
