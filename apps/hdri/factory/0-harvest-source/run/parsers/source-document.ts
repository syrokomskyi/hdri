/*
<MODULE_CONTRACT><purpose>Share exact source-file routing and website acceptance between harvesting and offline accounting.</purpose>
<non-goals><item>Does not read files, mint site identities or grant source admission.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Use real logical paths and one website disposition contract; reject blank source captures across all parsers.</item></CHANGE_SUMMARY>
*/
import path from "node:path";
import { normaliseDomain, isStopDomain } from "@syrokomskyi/business-core/ids";
import { getParserForSource } from "./index.js";

export const isSupportedSourceExtension = (extension: string): boolean =>
  [".csv", ".html", ".htm", ".mhtml"].includes(extension.toLowerCase());

export function parseSourceDocument(logicalPath: string, content: string) {
  const directory = path.posix.dirname(logicalPath.replace(/\\/g, "/"));
  const parser = getParserForSource(directory === "." ? "__batch_root__" : directory);
  if (!content.trim())
    return {
      parserId: parser.sourceId,
      disposition: "unrecognized" as const,
      result: { parserKind: "empty-source-unrecognized", items: [], warnings: ["empty-capture"] },
    };
  const result = parser.parse(content, logicalPath);
  const disposition =
    result.parserKind === "unknown" || result.parserKind.endsWith("-unrecognized")
      ? "unrecognized"
      : result.parserKind.endsWith("-ignored")
        ? "ignored"
        : "parsed";
  return { parserId: parser.sourceId, disposition, result } as const;
}

export function classifySeedWebsite(
  url: string | null,
):
  | { reason: "no_url" | "bad_url" | "stop_domain"; domain: null }
  | { reason: null; domain: string } {
  if (!url) return { reason: "no_url", domain: null };
  const domain = normaliseDomain(url);
  if (!domain) return { reason: "bad_url", domain: null };
  if (isStopDomain(domain)) return { reason: "stop_domain", domain: null };
  return { reason: null, domain };
}
