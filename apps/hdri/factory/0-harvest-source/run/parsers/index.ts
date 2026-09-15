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
  <item>Split StadtbranchenbuchParser into WwwStadtbranchenbuchComParser
    and BacknangStadtbranchenbuchComParser (handling stadtbranchenbuch.com subdomains).</item>
  <item>Register BranchenverzeichnisParser for branchenverzeichnis.org.</item>
  <item>RFC-0102: add classifyOrigin to detect external-host boundaries and prevent root parser fallback for nested external origins.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from "./types.js";
import { UnknownSourceParser } from "./UnknownSourceParser.js";
import { HandwerksradarParser } from "./HandwerksradarParser.js";
import { GelbeSeitenParser } from "./GelbeSeitenParser.js";
import { FirmenAbcParser } from "./FirmenAbcParser.js";
import { StadtbranchenbuchMirrorParser, isStadtbranchenbuchHost } from "./StadtbranchenbuchMirrorParser.js";
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
  new StadtbranchenbuchMirrorParser(),
  new HandwerkernetParser(),
  new Work5Parser(),
  new BranchenverzeichnisParser(),
];

const knownSourceIds = new Set(sourceParsers.map((p) => p.sourceId));

/**
 * Classify a path segment as a known source, external boundary, or unknown.
 * A segment that contains a dot (looks like a domain) and is not a known
 * source ID is an external-host boundary.
 */
export function classifyOrigin(segment: string): "known-source" | "external-boundary" | "unknown" {
  if (knownSourceIds.has(segment)) return "known-source";
  if (segment.includes(".")) return "external-boundary";
  return "unknown";
}

/**
 * Get a parser for a specific source ID (folder name).
 * Returns UnknownSourceParser if no specific parser is found.
 *
 * RFC-0102: A nested path segment that looks like an external host (contains
 * a dot, not a known source) must match its own parser or be quarantined.
 * Do not fall back to the root segment's parser for external boundaries.
 */
export function getParserForSource(sourceId: string): SourceParser {
  const segments = sourceId.split("/");

  // A mirror can contain external hosts: the deepest host is the authority.
  // Page shape is resolved by the family parser, never inferred from a city host.
  const hosts = segments.filter((segment) => segment.includes("."));
  if (hosts.length && isStadtbranchenbuchHost(hosts[hosts.length - 1]!))
    return sourceParsers.find((parser) => parser.sourceId === "stadtbranchenbuch-mirror")!;

  if (segments.length === 1) {
    // Single segment: try exact match, then subdomain pattern
    const parser = sourceParsers.find((p) => p.sourceId === segments[0]);
    if (parser) return parser;

    return new UnknownSourceParser(sourceId);
  }

  // Multiple segments: check for external-host boundaries in non-root segments.
  // If any non-root segment looks like an external host (contains a dot and is
  // not a known source ID), do not fall back to the root parser.
  const hasExternalBoundary = segments
    .slice(1)
    .some((seg) => classifyOrigin(seg!) === "external-boundary");

  // Try exact match on joined segments from deepest to shallowest.
  // Skip the root segment (i=0) so external domains nested under a known source
  // route to UnknownSourceParser instead of the root's parser.
  // If an external boundary is detected, stop before reaching the root segment.
  const minDepth = hasExternalBoundary ? 2 : 1;
  for (let i = segments.length - 1; i >= minDepth; i--) {
    const candidate = segments.slice(0, i + 1).join("/");
    const parser = sourceParsers.find((p) => p.sourceId === candidate);
    if (parser) return parser;
  }

  return new UnknownSourceParser(sourceId);
}

export * from "./types.js";
