import { describe, expect, it } from "vitest";
import { getParserForSource } from "../../parsers/index.js";

const parser = getParserForSource("www.stadtbranchenbuch.com/city.stadtbranchenbuch.com");
const page = "https://city.stadtbranchenbuch.com/123.html";
const business = {
  "@type": "LocalBusiness",
  "@id": page,
  name: "Primary GmbH",
  url: "https://primary.example",
};
const listing = `<div class="serp-listing js-serp-listing" data-listing-id="456">
  <h3>Related GmbH</h3><a href="https://city.stadtbranchenbuch.com/456.html">Profile</a>
  <a class="homepage" href="https://related.example">Homepage</a>
  <address><div>Side Street 1</div><span>12345</span><span>Town</span></address></div>`;
function detail(extra = "", entry: unknown = business) {
  return `<link rel="canonical" href="${page}"><script type="application/ld+json">${JSON.stringify([
    { "@type": "BreadcrumbList" },
    entry,
  ])}</script><section id="listing"><input name="eintragId" value="123">${extra}</section>`;
}

describe("shape-aware retained mirror parsing", () => {
  it("accepts retained opaque city tokens on root-host entity URLs", () => {
    expect(
      parser.parse(
        detail("", {
          ...business,
          "@id": "https://www.stadtbranchenbuch.com/U2NoZWxrbGluZ2Vu/123.html",
        }),
        "123.html",
      ).items[0].businessName,
    ).toBe("Primary GmbH");
  });
  it("matches retained yellowpages mirror profiles to root-host company identity", () => {
    const html = detail("", {
      ...business,
      "@id": "https://www.stadtbranchenbuch.com/city/123.html",
    }).replace(
      `href="${page}"`,
      'href="https://yellowpages-bb.stadtbranchenbuch.com/city/123.html"',
    );
    expect(parser.parse(html, "123.html").items[0].businessName).toBe("Primary GmbH");
  });
  it("rejects a category URL as primary identity even when its number matches", () => {
    expect(() =>
      parser.parse(
        detail().replace(`href="${page}"`, 'href="https://www.stadtbranchenbuch.com/E/123.html"'),
        "123.html",
      ),
    ).toThrow("SBB_CONFLICT");
  });
  it("quarantines external staging entity identities instead of borrowing their name", () => {
    expect(() =>
      parser.parse(
        detail("", { ...business, "@id": "https://www.de.staging.opendi.com/city/123.html" }),
        "123.html",
      ),
    ).toThrow("SBB_MISSING_ENTITY_NAME");
  });
  it("preserves primary address, category and coordinates without capturing category phone text", () => {
    const html =
      detail("<dl><dt>Adresse</dt><dd>Main Street 1</dd><dt>Ort</dt><dd>12345 Town</dd></dl>", {
        ...business,
        geo: { latitude: 48.1, longitude: 9.2 },
      }) + '<section id="categories"><h3>Branchen</h3> Gartenbau <br>012345678</section>';
    expect(parser.parse(html, "123.html").items[0]).toMatchObject({
      streetAddress: "Main Street 1",
      postalCode: "12345",
      city: "Town",
      category: "Gartenbau",
      raw: { lat: 48.1, lng: 9.2 },
    });
  });
  it("does not discard business evidence because the retained filename looks technical", () => {
    expect(parser.parse(detail(), "favicon.ico.html").items[0].sourceItemKey).toBe("sbb_123");
  });
  it("matches root-host city profile identities to the explicit primary ID", () => {
    expect(
      parser.parse(
        detail("", { ...business, "@id": "https://www.stadtbranchenbuch.com/city/123.html" }),
        "123.html",
      ).items[0].businessName,
    ).toBe("Primary GmbH");
  });
  it("matches the regional identity form without the bundesland prefix", () => {
    expect(
      parser.parse(
        detail("", {
          ...business,
          "@id": "https://baden-wuerttemberg.stadtbranchenbuch.com/city/123.html",
        }),
        "123.html",
      ).items[0].businessName,
    ).toBe("Primary GmbH");
  });
  it("matches a regional primary profile to its root-host structured identity", () => {
    const html = detail("", {
      ...business,
      "@id": "https://www.stadtbranchenbuch.com/city/123.html",
    }).replace(
      `href="${page}"`,
      'href="https://bundesland-baden-wuerttemberg.stadtbranchenbuch.com/city/123.html"',
    );
    expect(parser.parse(html, "123.html").items[0].businessName).toBe("Primary GmbH");
  });
  it("resolves mirrored relative navigation metadata without minting a company", () => {
    expect(
      parser.parse(
        '<link rel="canonical" href="index.html"><h1>Branchenbuch City</h1>',
        "city.stadtbranchenbuch.com/index.html",
      ),
    ).toMatchObject({ parserKind: "sbb-navigation-ignored", items: [] });
  });
  it("rejects external metadata even when primary evidence is present", () => {
    expect(() =>
      parser.parse(
        detail().replace(`href="${page}"`, 'href="https://external.example/123.html"'),
        "123.html",
      ),
    ).toThrow("SBB_INVALID_PAGE_URL");
  });
  it("extracts the actual city detail rather than silently returning no listing", () => {
    const result = parser.parse(detail(), "city.stadtbranchenbuch.com/123.html");
    expect(result.parserKind).toBe("sbb-detail");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      sourceItemKey: "sbb_123",
      businessName: "Primary GmbH",
      websiteUrl: "https://primary.example",
      sourceProfileUrl: page,
      raw: { sourceRole: "primary" },
    });
  });
  it("keeps primary and related occurrences separate on mixed pages", () => {
    const result = parser.parse(detail(listing), "123.html");
    expect(result.parserKind).toBe("sbb-mixed");
    expect(result.items.map((i) => [i.sourceItemKey, i.websiteUrl, i.raw.sourceRole])).toEqual([
      ["sbb_123", "https://primary.example", "primary"],
      ["sbb_456:listing:0", "https://related.example", "listing"],
    ]);
  });
  it("does not borrow a recommendation website for a primary company with no website", () => {
    const { url: _, ...withoutWebsite } = business;
    expect(
      parser.parse(detail(listing, withoutWebsite), "123.html").items[0].websiteUrl,
    ).toBeNull();
  });
  it("never mints a listing entity from the category filename", () => {
    const result = parser.parse(
      `<link rel="canonical" href="https://city.stadtbranchenbuch.com/E/112.html">${listing}`,
      "E/112.html",
    );
    expect(result.items.map((i) => i.sourceItemKey)).toEqual(["sbb_456:listing:0"]);
    expect(result.items[0].raw.sourceRole).toBe("listing");
  });
  it("selects matching JSON identity rather than the first business in an array", () => {
    const html = detail().replace(
      JSON.stringify(business),
      `${JSON.stringify({ ...business, "@id": "https://city.stadtbranchenbuch.com/999.html", name: "Other" })},${JSON.stringify(business)}`,
    );
    expect(parser.parse(html, "123.html").items[0].businessName).toBe("Primary GmbH");
  });
  it("supports explicit graph containers without mining unrelated nested JSON", () => {
    const html = detail("", { "@graph": [business], review: { ...business, name: "Wrong" } });
    expect(parser.parse(html, "123.html").items[0].businessName).toBe("Primary GmbH");
  });
  it.each([
    ["different primary IDs", () => detail('<input name="eintragId" value="999">')],
    [
      "metadata points at another company",
      () => detail().replace('/123.html"><script', '/999.html"><script'),
    ],
    [
      "conflicting JSON entities",
      () =>
        detail().replace(
          JSON.stringify(business),
          `${JSON.stringify(business)},${JSON.stringify(business)}`,
        ),
    ],
    ["invalid primary ID", () => detail().replace('value="123"', 'value="bad"')],
    [
      "listing ID conflicts with profile",
      () => listing.replace('data-listing-id="456"', 'data-listing-id="789"'),
    ],
    ["listing has no retained ID", () => '<div class="serp-listing"><h3>Wrong</h3></div>'],
    ["malformed structured data", () => detail().replace('"LocalBusiness"', "invalid")],
    ["missing primary name", () => detail("", { ...business, name: null })],
    [
      "conflicting primary websites",
      () => detail('<a class="homepage" href="https://other.example">Other</a>'),
    ],
  ] as const)("rejects %s without inventing or silently dropping an entity", (_name, html) => {
    expect(() => parser.parse(html(), "123.html")).toThrow();
  });
  it("does not treat catalog profile URLs as company websites", () => {
    expect(
      parser.parse(detail("", { ...business, url: page }), "123.html").items[0].websiteUrl,
    ).toBeNull();
  });
  it.each([
    "mailto:x@example.com",
    "javascript:alert(1)",
    "/contact",
    "#",
    "https://u:p@example.com",
  ])("does not admit non-website URL %s", (url) => {
    expect(
      parser.parse(detail("", { ...business, url }), "123.html").items[0].websiteUrl,
    ).toBeNull();
  });
  it("preserves unresolved page classification as an explicit warning", () => {
    expect(parser.parse("<h1>Unrecognized page</h1>", "112.html")).toMatchObject({
      parserKind: "sbb-unrecognized",
      items: [],
      warnings: ["unrecognized-page-shape"],
    });
  });
  it("rejects oversized HTML before DOM parsing", () => {
    expect(() => parser.parse("x".repeat(8 * 1024 * 1024 + 1), "123.html")).toThrow(
      "SBB_FILE_TOO_LARGE",
    );
  });
  it("quarantines a nested external host even when its ancestor is a known city", () => {
    const external = getParserForSource(
      "www.stadtbranchenbuch.com/city.stadtbranchenbuch.com/external.example",
    );
    expect(external.parse(detail(), "123.html").parserKind).toBe("unknown");
  });
});
