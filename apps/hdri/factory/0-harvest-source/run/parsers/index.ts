/*
<MODULE_CONTRACT>
<purpose>Registry and factory for source-specific parsers — this module handles index operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement any parsing logic directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Rename Catalog to Source in the registry and factory.</item>
  <item>Rewrite getParserForSource with deepest-match routing for nested directory structures (RFC-0069).</item>
  <item>Register HandwerkernetParser for handwerkernet.de.</item>
  <item>Register Work5Parser for work5.de.</item>
  <item>
    Split StadtbranchenbuchParser into WwwStadtbranchenbuchComParser
    and BacknangStadtbranchenbuchComParser (handling stadtbranchenbuch.com subdomains).
  </item>
  <item>Register BranchenverzeichnisParser for branchenverzeichnis.org.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from "./types.js";
import { UnknownSourceParser } from "./UnknownSourceParser.js";
import { HandwerksradarParser } from "./HandwerksradarParser.js";
import { GelbeSeitenParser } from "./GelbeSeitenParser.js";
import { FirmenAbcParser } from "./FirmenAbcParser.js";
import { WwwStadtbranchenbuchComParser } from "./WwwStadtbranchenbuchComParser.js";
import { BacknangStadtbranchenbuchComParser } from "./BacknangStadtbranchenbuchComParser.js";
import { HandwerkernetParser } from "./HandwerkernetParser.js";
import { Work5Parser } from "./Work5Parser.js";
import { BranchenverzeichnisParser } from "./BranchenverzeichnisParser.js";

/**
 * Registry of all available source parsers.
 */
const sourceParsers: SourceParser[] = [
  new HandwerksradarParser(),
  new GelbeSeitenParser(),
  new FirmenAbcParser(),
  new WwwStadtbranchenbuchComParser(),
  new BacknangStadtbranchenbuchComParser(),
  new HandwerkernetParser(),
  new Work5Parser(),
  new BranchenverzeichnisParser(),
];

/**
 * Get a parser for a specific source ID (folder name).
 * Returns UnknownSourceParser if no specific parser is found.
 */
export function getParserForSource(sourceId: string): SourceParser {
  // Split into segments (e.g. "www.stadtbranchenbuch.com/darmstadt.stadtbranchenbuch.com" -> ["www.stadtbranchenbuch.com", "darmstadt.stadtbranchenbuch.com"])
  const segments = sourceId.split("/");

  // Try exact match on joined segments from deepest to shallowest
  for (let i = segments.length - 1; i >= 0; i--) {
    const candidate = segments.slice(0, i + 1).join("/");
    const parser = sourceParsers.find((p) => p.sourceId === candidate);
    if (parser) return parser;
  }

  // Fallback: check if any segment matches a known stadtbranchenbuch subdomain pattern
  for (let i = segments.length - 1; i >= 0; i--) {
    if (
      segments[i]!.endsWith(".stadtbranchenbuch.com") &&
      segments[i] !== "www.stadtbranchenbuch.com"
    ) {
      const parser = sourceParsers.find((p) => p.sourceId === "backnang.stadtbranchenbuch.com");
      if (parser) return parser;
    }
  }

  return new UnknownSourceParser(sourceId);
}

export * from "./types.js";
