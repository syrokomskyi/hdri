import { describe, it, expect } from "vitest";
import { Work5Parser } from "../../parsers/Work5Parser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new Work5Parser();
const fixtureDir = join(__dirname, "fixtures", "work5.de");

describe("Work5Parser", () => {
  it("parses service provider detail page", () => {
    const html = readFileSync(join(fixtureDir, "detail-page.html"), "utf8");
    const result = parser.parse(html, "work5.de/dienstleister/testfirma-work5.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Testfirma Work5");
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("parses another service provider detail page", () => {
    const html = readFileSync(join(fixtureDir, "detail-page-2.html"), "utf8");
    const result = parser.parse(html, "work5.de/dienstleister/beispiel-work5.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Beispiel Service");
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });
});
