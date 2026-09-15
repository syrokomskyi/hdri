/*
<MODULE_CONTRACT>
  <purpose>Parse retained Stadtbranchenbuch mirror pages with explicit primary and listing entity ownership.</purpose>
  <non-goals><item>Does not fetch websites, infer entities from filenames or authorize quarterly admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Recognize business and signature-verified informational pages; empty captures are never technical success.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: A listing embedded in a detail page is never the primary company; unknown shapes must remain explicit.
import * as cheerio from "cheerio";
import type { SourceParser } from "./types.js";
import type { SourceBusinessSeed, SourceParseResult } from "../source-records.js";

const LISTINGS = ".serp-listing, .js-serp-listing";
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_ENTITIES = 10_000;
const REGIONAL_HOST =
  /^(?:bundesland-)?(?:baden-wuerttemberg|bayern|berlin|brandenburg|bremen|hamburg|hessen|mecklenburg-vorpommern|niedersachsen|nordrhein-westfalen|rheinland-pfalz|saarland|sachsen|sachsen-anhalt|schleswig-holstein|thueringen)\.stadtbranchenbuch\.com$/;
type JsonObject = Record<string, unknown>;
type Selection = ReturnType<cheerio.CheerioAPI>;
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const numericId = (value: unknown): string | null => {
  const result = text(value);
  return result && /^[1-9][0-9]{0,19}$/.test(result) ? result : null;
};
export const isStadtbranchenbuchHost = (host: string): boolean =>
  host === "stadtbranchenbuch.com" || host.endsWith(".stadtbranchenbuch.com");

function catalogUrl(value: unknown, base?: string): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    return /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      isStadtbranchenbuchHost(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function profileId(url: string | null): string | null {
  if (!url) return null;
  const parsed = new URL(url);
  // Root and regional hosts publish /<city-slug>/<entity>.html identities.
  const cityProfile =
    /^(?:www\.)?stadtbranchenbuch\.com$/.test(parsed.hostname) ||
    REGIONAL_HOST.test(parsed.hostname) ||
    parsed.hostname === "yellowpages-bb.stadtbranchenbuch.com"
      ? parsed.pathname.match(/^\/[A-Za-z][A-Za-z0-9_-]{1,127}\/([1-9][0-9]*)\.html$/)
      : null;
  if (cityProfile) return numericId(cityProfile[1]);
  const match = parsed.pathname.match(/^\/(?:eintrag\/([1-9][0-9]*)|([1-9][0-9]*)\.html)\/?$/);
  return match ? numericId(match[1] ?? match[2]) : null;
}
function website(value: unknown): string | null {
  let raw = text(value);
  if (!raw || /\s/.test(raw) || /^[#/.](?!\/)/.test(raw)) return null;
  if (raw.startsWith("//")) raw = `https:${raw}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      url.hostname.includes(".") &&
      !isStadtbranchenbuchHost(url.hostname)
      ? raw
      : null;
  } catch {
    return null;
  }
}
function single(values: (string | null)[], label: string): string | null {
  const unique = [...new Set(values.filter((v): v is string => v !== null))];
  if (unique.length > 1) throw new Error(`SBB_CONFLICT: ${label}`);
  return unique[0] ?? null;
}

export class StadtbranchenbuchMirrorParser implements SourceParser {
  readonly sourceId = "stadtbranchenbuch-mirror";

  parse(content: string, fileName: string): SourceParseResult {
    if (Buffer.byteLength(content) > MAX_HTML_BYTES) throw new Error("SBB_FILE_TOO_LARGE");
    const $ = cheerio.load(content);
    const warnings: string[] = [];
    const items: SourceBusinessSeed[] = [];
    const segments = fileName.replace(/\\/g, "/").split("/");
    const hostIndex = segments.findLastIndex(isStadtbranchenbuchHost);
    const pageBase = hostIndex < 0 ? undefined : `https://${segments.slice(hostIndex).join("/")}`;
    // Only top-level arrays and @graph containers are traversed; arbitrary nested
    // objects (reviews, recommendations, aggregate metadata) are not primary evidence.
    const businesses: JsonObject[] = [];
    const jsonDocuments: unknown[] = [];
    let jsonNodes = 0;
    const visit = (value: unknown, depth = 0): void => {
      if (++jsonNodes > MAX_ENTITIES || depth > 16) throw new Error("SBB_JSON_LIMIT");
      if (Array.isArray(value)) {
        for (const child of value) visit(child, depth + 1);
        return;
      }
      if (!object(value)) return;
      if (
        value["@type"] === "LocalBusiness" ||
        (Array.isArray(value["@type"]) && value["@type"].includes("LocalBusiness"))
      )
        businesses.push(value);
      if (value["@graph"] !== undefined) visit(value["@graph"], depth + 1);
    };
    $('script[type="application/ld+json"]').each((_, node) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse($(node).text());
      } catch {
        throw new Error("SBB_INVALID_JSON_LD");
      }
      jsonDocuments.push(parsed);
      visit(parsed);
    });
    const idInputs = $('input[name="eintragId"]')
      .toArray()
      .map((node) => {
        const id = numericId($(node).attr("value"));
        if (!id) throw new Error("SBB_INVALID_PRIMARY_ID");
        return id;
      });
    const primaryId = single(idInputs, "primary-id");
    const listingNodes = $(LISTINGS).toArray();
    const informationalOnly =
      !primaryId &&
      businesses.length === 0 &&
      listingNodes.length === 0 &&
      jsonDocuments.every((doc) => object(doc) && doc["@type"] === "WebSite");
    const localPath = segments.slice(hostIndex + 1).join("/");
    if (informationalOnly) {
      if (
        /^content\/(?:datenschutz|impressum)\.html$/.test(localPath) &&
        /^(?:Datenschutz|Impressum)$/.test($("title").text().trim()) &&
        $("h1").first().text().trim().startsWith("Datenschutzerklärung Stadtbranchenbuch.com")
      )
        return { parserKind: "sbb-legal-ignored", items: [], warnings: ["catalog-legal-document"] };
      if (
        fileName.endsWith("/index.html") &&
        $('meta[name="generator"]').attr("content") === "HTTrack Website Copier/3.x" &&
        $("h1").first().text().trim() === "Index of locally available sites:"
      )
        return {
          parserKind: "sbb-mirror-index-ignored",
          items: [],
          warnings: ["mirror-generated-index"],
        };
    }
    const metadata = $('link[rel="canonical"], meta[property="og:url"]')
      .toArray()
      .map((node) => {
        const url = catalogUrl($(node).attr("href") ?? $(node).attr("content"), pageBase);
        if (!url) throw new Error("SBB_INVALID_PAGE_URL");
        return url;
      });
    const canonical = single(metadata, "page-url");
    if (primaryId && canonical && profileId(canonical) !== primaryId)
      throw new Error("SBB_CONFLICT: primary-profile-id");
    if (listingNodes.length > MAX_ENTITIES) throw new Error("SBB_LISTING_LIMIT");

    const findBusiness = (id: string, allowAnonymous: boolean): JsonObject | null => {
      const matching = businesses.filter((entry) => profileId(catalogUrl(entry["@id"])) === id);
      if (matching.length > 1) throw new Error("SBB_CONFLICT: json-entity-id");
      if (matching.length === 1) return matching[0]!;
      return allowAnonymous && businesses.length === 1 && !businesses[0]!["@id"]
        ? businesses[0]!
        : null;
    };
    const make = (
      id: string,
      root: Selection,
      json: JsonObject | null,
      profile: string | null,
      role: "primary" | "listing",
      ordinal: number,
    ): SourceBusinessSeed => {
      const domName = root
        .find(role === "listing" ? "h3" : "h1, [itemprop=name]")
        .first()
        .text()
        .trim();
      const name = text(json?.name) ?? text(domName);
      if (!name) throw new Error("SBB_MISSING_ENTITY_NAME");
      const address = object(json?.address) ? json.address : {};
      const labelled = new Map<string, Selection>();
      root.find("dl dt").each((_, node) => {
        labelled.set($(node).text().trim().toLowerCase(), $(node).next("dd"));
      });
      const websites: (string | null)[] = [website(json?.url)];
      root.find("a.homepage").each((_, node) => {
        websites.push(website($(node).attr("data-follow-link") ?? $(node).attr("href")));
      });
      for (const label of ["website", "webseite", "homepage"]) {
        labelled
          .get(label)
          ?.find("a")
          .each((_, node) => {
            websites.push(website($(node).attr("data-follow-link") ?? $(node).attr("href")));
          });
      }
      const place =
        labelled.get("ort")?.text().trim() ??
        root
          .find("address > span")
          .toArray()
          .map((node) => $(node).text().trim())
          .join(" ");
      const postcode =
        text(address.postalCode) ??
        place?.match(/\b[0-9]{5}\b/)?.[0] ??
        root
          .find("dl.address")
          .text()
          .match(/\b[0-9]{5}\b/)?.[0] ??
        null;
      const city =
        text(address.addressLocality) ??
        (place && postcode ? text(place.slice(place.indexOf(postcode) + postcode.length)) : null);
      let primaryCategory: string | null = null;
      if (role === "primary" && $("section#categories").length === 1) {
        const fragments: string[] = [];
        let afterHeading = false;
        for (const node of $("section#categories").contents().toArray()) {
          if ($(node).is("h3") && $(node).text().trim() === "Branchen") {
            afterHeading = true;
            continue;
          }
          if (afterHeading && $(node).is("br")) break;
          if (afterHeading) fragments.push($(node).text());
        }
        primaryCategory = text(fragments.join(" ").replace(/\s+/g, " "));
      }
      const category =
        role === "primary"
          ? (primaryCategory ?? text($("ol.breadcrumbs li.breadcrumb").slice(-2, -1).text()))
          : text(root.find(".infos > div > span").first().text());
      const geo = object(json?.geo) ? json.geo : {};
      return {
        sourceItemKey: role === "primary" ? `sbb_${id}` : `sbb_${id}:listing:${ordinal}`,
        sourcePageNumber: null,
        businessName: name,
        streetAddress:
          text(address.streetAddress) ??
          text(labelled.get("adresse")?.text()) ??
          text(root.find("address > div, dl.address dd").first().text()),
        postalCode: postcode,
        city,
        phone:
          text(json?.telephone) ??
          text(labelled.get("telefonnummer")?.text()) ??
          text(root.find(".phone").first().text()),
        email: null,
        websiteUrl: single(websites, "entity-website"),
        category,
        sourceProfileUrl: profile,
        raw: {
          sourceFile: fileName,
          sourceRole: role,
          sourceOrdinal: ordinal,
          sourcePageUrl: canonical,
          sourceEntityId: id,
          lat: geo.latitude ?? null,
          lng: geo.longitude ?? null,
        },
      };
    };

    if (primaryId) {
      const root = ($("#listing").length === 1 ? $("#listing") : $("body")).clone();
      root.find(LISTINGS).remove();
      items.push(
        make(
          primaryId,
          root,
          findBusiness(primaryId, listingNodes.length === 0),
          canonical,
          "primary",
          0,
        ),
      );
    }
    listingNodes.forEach((node, ordinal) => {
      const root = $(node);
      const profiles = root
        .find("a[href]")
        .toArray()
        .map((a) => catalogUrl($(a).attr("href"), canonical ?? undefined))
        .filter((url) => profileId(url) !== null);
      const profile = single(profiles, "listing-profile");
      const attribute = root.attr("data-listing-id");
      if (attribute !== undefined && !numericId(attribute))
        throw new Error("SBB_INVALID_LISTING_ID");
      const id = single([numericId(attribute), profileId(profile)], "listing-id");
      if (!id) throw new Error("SBB_MISSING_LISTING_ID");
      items.push(make(id, root, findBusiness(id, false), profile, "listing", ordinal));
    });
    if (items.length)
      return {
        parserKind: primaryId ? (listingNodes.length ? "sbb-mixed" : "sbb-detail") : "sbb-listing",
        items,
        warnings,
      };
    if (
      informationalOnly &&
      canonical === "https://www.stadtbranchenbuch.com/grossstaedte-deutschland.html" &&
      $("title").text().trim() === "Stadtbranchenbuch - Alle Orte von Aachen bis Senftenberg"
    )
      return { parserKind: "sbb-city-index-ignored", items: [], warnings: ["catalog-city-index"] };
    if (canonical && !profileId(canonical) && $(".no-results").length)
      return { parserKind: "sbb-empty-listing", items: [], warnings: ["explicit-empty-listing"] };
    // Recognized navigation is retained as an explicit no-seed outcome, never a company.
    if (
      canonical &&
      !profileId(canonical) &&
      businesses.length === 0 &&
      (/(?:^|\/)index\.html$/i.test(fileName) ||
        /^\/(?:[A-Z]\/?)?$/.test(new URL(canonical).pathname))
    )
      return { parserKind: "sbb-navigation-ignored", items: [], warnings: ["catalog-navigation"] };
    return { parserKind: "sbb-unrecognized", items: [], warnings: ["unrecognized-page-shape"] };
  }
}
