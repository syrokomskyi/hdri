/*
<MODULE_CONTRACT>
<purpose>Source file reading and Markdown report rendering for the parse-sources gogol.</purpose>
<non-goals>
  <item>Does not write to the database or drive batch processing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted report rendering and source-file reading from ParseSourcesGogol.ts during file-size refactor.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";

import { markdownTable } from "markdown-table";

import type { BatchReport } from "./parse-sources-types.js";

/**
 * Read a source file, detecting its character encoding for HTML files.
 *
 * Some scraped sites (e.g. branchenverzeichnis.org) serve ISO-8859-1 / Windows-1252
 * even though the file extension is .html — reading them as UTF-8 corrupts umlauts
 * (e.g. "Görlitz" → "Grlitz"). We sniff the <meta charset> declaration in the first
 * 2 KB and decode accordingly. CSV inputs are assumed to be UTF-8.
 */
export const readSourceFile = async (absolutePath: string, ext: string): Promise<string> => {
  if (ext !== ".html" && ext !== ".htm" && ext !== ".mhtml") {
    return fs.readFile(absolutePath, "utf-8");
  }

  const buf = await fs.readFile(absolutePath);
  // Sniff first 2 KB as latin1 (lossless byte-preserving) to find the meta charset.
  const head = buf.slice(0, Math.min(buf.length, 2048)).toString("latin1").toLowerCase();

  let charset = "utf-8";
  const m =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_:-]+)/i) ??
    head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([a-z0-9_:-]+)/i);
  if (m && m[1]) charset = m[1].toLowerCase();

  // Map legacy aliases to TextDecoder-recognized labels.
  if (charset === "iso-8859-1" || charset === "latin1" || charset === "latin-1") {
    charset = "windows-1252"; // browsers treat 8859-1 as cp1252; matches what scrapers fetched
  }

  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    // Unknown label — fall back to UTF-8.
    return buf.toString("utf-8");
  }
};

export const renderReportMd = (
  batches: BatchReport[],
  maxPages: number,
  doneAt: string,
): string => {
  const lines: string[] = [
    `# Parse Sources — Report`,
    ``,
    `**Harvest batch ID:** harvest  `,
    `**Completed:** ${doneAt}  `,
    `**maxPages:** ${maxPages < 0 ? "unlimited" : maxPages}`,
    ``,
  ];

  // Group statistics by source (first folder inside batch) instead of by batch
  const sourceStats = new Map<
    string,
    {
      sourceFiles: number;
      itemsParsed: number;
      noUrlWarnings: number;
      itemsRegistered: number;
      badUrl: number;
      stopDomain: number;
      noUrl: number;
    }
  >();

  for (const batch of batches) {
    for (const file of batch.sourceFiles) {
      // Extract source from batchScopedPath: "2026-04/branchenverzeichnis.org/..."
      const source = file.path.split("/")[1] ?? "unknown";
      const existing = sourceStats.get(source);
      if (existing) {
        existing.sourceFiles++;
        existing.itemsParsed += file.itemsParsed;
        existing.itemsRegistered += file.itemsRegistered;
        existing.noUrl += file.noUrl;
        existing.badUrl += file.badUrl;
        existing.stopDomain += file.stopDomain;
      } else {
        sourceStats.set(source, {
          sourceFiles: 1,
          itemsParsed: file.itemsParsed,
          noUrlWarnings: 0,
          itemsRegistered: file.itemsRegistered,
          badUrl: file.badUrl,
          stopDomain: file.stopDomain,
          noUrl: file.noUrl,
        });
      }
    }
  }

  const sortedSources = Array.from(sourceStats.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Calculate totals
  const totalSourceFiles = batches.reduce((sum, b) => sum + b.sourceFiles.length, 0);
  const totalParsed = batches.reduce(
    (sum, b) => sum + b.sourceFiles.reduce((s, f) => s + f.itemsParsed, 0),
    0,
  );
  const totalNoUrlWarnings = batches.reduce((sum, b) => sum + b.noUrlWarnings, 0);
  const totalRegistered = batches.reduce(
    (sum, b) => sum + b.sourceFiles.reduce((s, f) => s + f.itemsRegistered, 0),
    0,
  );
  const totalBadUrl = batches.reduce((sum, b) => sum + b.skipSummary.badUrl, 0);
  const totalStopDomain = batches.reduce((sum, b) => sum + b.skipSummary.stopDomain, 0);
  const totalNoUrl = batches.reduce((sum, b) => sum + b.skipSummary.noUrl, 0);
  const totalSkipped = totalNoUrl + totalBadUrl + totalStopDomain;

  // Create source statistics table with each source as a column
  const sourceHeaders = ["Total", ...sortedSources.map(([name]) => name)];
  const batchStatsTable: string[][] = [sourceHeaders];

  // Add rows for each metric
  batchStatsTable.push([
    "Source files processed",
    String(totalSourceFiles),
    ...sortedSources.map(([, s]) => String(s.sourceFiles)),
  ]);
  batchStatsTable.push([
    "Items with URL (parsed)",
    String(totalParsed),
    ...sortedSources.map(([, s]) => String(s.itemsParsed)),
  ]);
  batchStatsTable.push([
    "Items without URL (ignored by parser)",
    String(totalNoUrlWarnings),
    ...sortedSources.map(([, s]) => String(s.noUrlWarnings)),
  ]);
  batchStatsTable.push([
    "Sites registered",
    String(totalRegistered),
    ...sortedSources.map(([, s]) => String(s.itemsRegistered)),
  ]);
  batchStatsTable.push([
    "Skipped — bad URL",
    String(totalBadUrl),
    ...sortedSources.map(([, s]) => String(s.badUrl)),
  ]);
  batchStatsTable.push([
    "Skipped — stop domain",
    String(totalStopDomain),
    ...sortedSources.map(([, s]) => String(s.stopDomain)),
  ]);
  batchStatsTable.push([
    "Skipped — total",
    String(totalSkipped),
    ...sortedSources.map(([, s]) => String(s.noUrl + s.badUrl + s.stopDomain)),
  ]);

  lines.push(
    `## Batch`,
    ``,
    markdownTable(batchStatsTable, { align: ["l", ...sortedSources.map(() => "r")] }),
    ``,
    `> **maxPages** limits the number of source files (pages) parsed per run.`,
    `> Raise \`maxPages\` to parse more source files.`,
    ``,
  );

  // Per-batch details are intentionally omitted from report.md;
  // the detailed source-file breakdown is available in
  // batches/<name>/sources.csv for each batch.
  for (const b of batches) {
    lines.push(
      `## Batch: ${b.batchName}`,
      ``,
      `See \`batches/${b.batchName}/sources.csv\` for the detailed file-level breakdown.`,
      ``,
    );
  }

  return lines.join("\n");
};
