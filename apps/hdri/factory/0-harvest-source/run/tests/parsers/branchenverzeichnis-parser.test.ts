import { describe, it, expect } from "vitest";
import { BranchenverzeichnisParser } from "../../parsers/BranchenverzeichnisParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new BranchenverzeichnisParser();
const fixtureDir = join(__dirname, "fixtures", "branchenverzeichnis.org");

describe("BranchenverzeichnisParser", () => {
  it("parses vcard detail page with org name", () => {
    const html = readFileSync(join(fixtureDir, "detail-page.html"), "utf8");
    const result = parser.parse(html, "branchenverzeichnis.org/infos/vcard/5001/testfirma-bv.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Testfirma BV GmbH");
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("parses vcard detail page with fn name", () => {
    const html = readFileSync(join(fixtureDir, "detail-page-2.html"), "utf8");
    const result = parser.parse(html, "branchenverzeichnis.org/infos/vcard/5002/musterbetrieb-bv.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Musterbetrieb BV AG");
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });
});
