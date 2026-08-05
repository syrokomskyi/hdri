import { describe, it, expect } from "vitest";
import { WwwStadtbranchenbuchComParser } from "../../parsers/WwwStadtbranchenbuchComParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new WwwStadtbranchenbuchComParser();
const fixtureDir = join(__dirname, "fixtures", "www.stadtbranchenbuch.com");

describe("WwwStadtbranchenbuchComParser", () => {
  it("extracts websiteUrl from JSON-LD when present", () => {
    const html = readFileSync(join(fixtureDir, "detail-with-jsonld-url.html"), "utf8");
    const result = parser.parse(html, "detail-with-jsonld-url.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.websiteUrl).toBe("https://example-business.de");
  });

  it("falls back to DOM for websiteUrl when JSON-LD url is absent", () => {
    const html = readFileSync(join(fixtureDir, "detail-without-jsonld-url.html"), "utf8");
    const result = parser.parse(html, "detail-without-jsonld-url.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.websiteUrl).not.toBeNull();
    expect(result.items[0]!.websiteUrl).toMatch(/^https?:\/\//);
  });

  it("extracts business data from DOM when JSON-LD is absent", () => {
    const html = readFileSync(join(fixtureDir, "detail-no-jsonld.html"), "utf8");
    const result = parser.parse(html, "detail-no-jsonld.html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBeTruthy();
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("ignores noise files", () => {
    const result = parser.parse("", "favicon.ico.html");
    expect(result.items).toHaveLength(0);
  });
});
