/*
<MODULE_CONTRACT>
<purpose>Registry and factory for source-specific parsers.</purpose>
<keywords>parser, registry, factory, source</keywords>
<responsibilities>
  <item>Maintains a list of all available SourceParser implementations.</item>
  <item>Provides a factory method to retrieve the correct parser for a given source ID.</item>
  <item>Returns a fallback UnknownSourceParser for unregistered source IDs.</item>
</responsibilities>
<non-goals>
  <item>Do not implement any parsing logic directly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="getParserForSource">Factory method to retrieve a parser by source ID.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rename Catalog to Source in the registry and factory.</item>
  <item>Fix getParserForSource to match top-level source directory for nested files.</item>
  <item>Register HandwerkernetParser for handwerkernet.de.</item>
  <item>Register Work5Parser for work5.de.</item>
  <item>
    Split StadtbranchenbuchParser into WwwStadtbranchenbuchComParser
    and BacknangStadtbranchenbuchComParser (handling stadtbranchenbuch.com subdomains).
  </item>
  <item>Register BranchenverzeichnisParser for branchenverzeichnis.org.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from './types.js';
import { UnknownSourceParser } from './UnknownSourceParser.js';
import { HandwerksradarParser } from './HandwerksradarParser.js';
import { GelbeSeitenParser } from './GelbeSeitenParser.js';
import { FirmenAbcParser } from './FirmenAbcParser.js';
import { WwwStadtbranchenbuchComParser } from './WwwStadtbranchenbuchComParser.js';
import { BacknangStadtbranchenbuchComParser } from './BacknangStadtbranchenbuchComParser.js';
import { HandwerkernetParser } from './HandwerkernetParser.js';
import { Work5Parser } from './Work5Parser.js';
import { BranchenverzeichnisParser } from './BranchenverzeichnisParser.js';

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
  // Extract the first segment if there are multiple segments (e.g. "domain.com/sub" -> "domain.com")
  const rootSourceId = sourceId.split('/')[0]!;
  
  // Try exact match first (e.g. "www.stadtbranchenbuch.com" or "backnang.stadtbranchenbuch.com")
  let parser = sourceParsers.find((p) => p.sourceId === rootSourceId);
  
  // Fallback for other city subdomains (e.g. "frankfurt.stadtbranchenbuch.com" -> use the Backnang parser as a generic SERP parser)
  if (!parser && rootSourceId.endsWith('.stadtbranchenbuch.com')) {
    parser = sourceParsers.find((p) => p.sourceId === 'backnang.stadtbranchenbuch.com');
  }
  
  return parser ?? new UnknownSourceParser(sourceId);
}

export * from './types.js';
