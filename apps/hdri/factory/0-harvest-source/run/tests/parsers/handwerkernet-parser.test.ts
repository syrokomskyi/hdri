import { describe, it, expect } from "vitest";
import { HandwerkernetParser } from "../../parsers/HandwerkernetParser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parser = new HandwerkernetParser();
const fixtureDir = join(__dirname, "fixtures", "handwerkernet.de");

describe("HandwerkernetParser", () => {
  it("parses HTML with multiple LocalBusiness entries", () => {
    const html = readFileSync(join(fixtureDir, "detail-page.html"), "utf8");
    const result = parser.parse(
      html,
      "handwerkernet.de/handwerker_firmen/dachdecker/dachdecker_handwerkernet_001.html",
    );
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.businessName).toBeTruthy();
    expect(result.items[0]!.websiteUrl).not.toBeNull();
  });

  it("parses HTML with single LocalBusiness entry", () => {
    const html = readFileSync(join(fixtureDir, "detail-page-2.html"), "utf8");
    const result = parser.parse(
      html,
      "handwerkernet.de/handwerker_firmen/sanitaer/sanitaer_handwerkernet_002.html",
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.businessName).toBe("Muster Sanitaer GmbH");
  });
});
