import { describe, it, expect } from "vitest";
import { GelbeSeitenParser } from "../../parsers/GelbeSeitenParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new GelbeSeitenParser();
const fixtureDir = join(__dirname, "fixtures", "gelbeseiten.de");

describe("GelbeSeitenParser", () => {
  it("parses HTML with multiple results", () => {
    const html = readFileSync(join(fixtureDir, "detail-page.html"), "utf8");
    const result = parser.parse(html, "detail-page.html");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.businessName).toBeTruthy();
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("parses HTML with single result", () => {
    const html = readFileSync(join(fixtureDir, "detail-page-2.html"), "utf8");
    const result = parser.parse(html, "detail-page-2.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Testelektriker Schulz");
  });
});
