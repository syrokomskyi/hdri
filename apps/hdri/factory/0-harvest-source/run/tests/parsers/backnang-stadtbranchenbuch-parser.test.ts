import { describe, it, expect } from "vitest";
import { BacknangStadtbranchenbuchComParser } from "../../parsers/BacknangStadtbranchenbuchComParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new BacknangStadtbranchenbuchComParser();
const fixtureDir = join(__dirname, "fixtures", "backnang.stadtbranchenbuch.com");

describe("BacknangStadtbranchenbuchComParser", () => {
  it("parses standard SERP listing page", () => {
    const html = readFileSync(join(fixtureDir, "serp-listing.html"), "utf8");
    const result = parser.parse(html, "serp-listing.html");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.businessName).toBeTruthy();
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("returns empty items for SERP page with no results", () => {
    const html = readFileSync(join(fixtureDir, "serp-empty.html"), "utf8");
    const result = parser.parse(html, "serp-empty.html");
    expect(result.items).toHaveLength(0);
  });
});
