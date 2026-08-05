import { describe, it, expect } from "vitest";
import { FirmenAbcParser } from "../../parsers/FirmenAbcParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new FirmenAbcParser();
const fixtureDir = join(__dirname, "fixtures", "firmenabc.de");

describe("FirmenAbcParser", () => {
  it("parses HTML with multiple listings", () => {
    const html = readFileSync(join(fixtureDir, "detail-page.html"), "utf8");
    const result = parser.parse(html, "detail-page.html");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.businessName).toBeTruthy();
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("parses HTML with single entry", () => {
    const html = readFileSync(join(fixtureDir, "detail-page-2.html"), "utf8");
    const result = parser.parse(html, "detail-page-2.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Musterbetrieb Delta");
  });
});
