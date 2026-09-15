/*
<MODULE_CONTRACT><purpose>Share exact source-file routing and website acceptance between harvesting and offline accounting.</purpose>
<non-goals><item>Does not read files, mint site identities or grant source admission.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Q3 correction: use real logical file paths and one website disposition contract.</item></CHANGE_SUMMARY>
*/
import path from "node:path";
import { normaliseDomain, isStopDomain } from "@syrokomskyi/business-core/ids";
import { getParserForSource } from "./index.js";

export function parseSourceDocument(logicalPath: string, content: string) {
  const directory = path.posix.dirname(logicalPath.replace(/\\/g, "/"));
  const parser = getParserForSource(directory === "." ? "__batch_root__" : directory);
  const result = parser.parse(content, logicalPath);
  const disposition = result.parserKind === "unknown" || result.parserKind.endsWith("-unrecognized")
    ? "unrecognized" : result.parserKind.endsWith("-ignored") ? "ignored" : "parsed";
  return { parserId: parser.sourceId, disposition, result } as const;
}

export function classifySeedWebsite(url: string | null):
  | { reason: "no_url" | "bad_url" | "stop_domain"; domain: null }
  | { reason: null; domain: string } {
  if (!url) return { reason: "no_url", domain: null };
  const domain = normaliseDomain(url);
  if (!domain) return { reason: "bad_url", domain: null };
  if (isStopDomain(domain)) return { reason: "stop_domain", domain: null };
  return { reason: null, domain };
}
