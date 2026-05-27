/*
<MODULE_CONTRACT>
<purpose>Shared CSV parsing logic for standardized source formats.</purpose>
<keywords>csv, parser, shared, source</keywords>
<responsibilities>
  <item>Provides a common way to parse the standardized CSV format used by multiple sources.</item>
  <item>Handles header mapping and row normalization.</item>
</responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="parseStandardizedCsv">Function to parse a CSV string into SourceBusinessSeed items using csv-parse/sync.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Extract shared CSV parsing logic for reuse across multiple source parsers.</item>
  <item>Update terminology from 'catalog' to 'source'.</item>
  <item>Replace hand-rolled CSV parser with csv-parse/sync package.</item>
</CHANGE_SUMMARY>
*/

import { parse as parseCsv } from 'csv-parse/sync';
import type { SourceBusinessSeed } from '../source-records.js';

/**
 * Parses the standardized CSV format into SourceBusinessSeed items.
 */
export function parseStandardizedCsv(
  content: string,
  prefix: string,
): { items: SourceBusinessSeed[]; warnings: string[] } {
  const rows = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  if (rows.length === 0) {
    return { items: [], warnings: ['Empty CSV file'] };
  }

  // Normalise headers to handle potential encoding issues (e.g. StraYe vs Straße)
  const normaliseHeader = (h: string): string => {
    const s = h.trim();
    if (s.startsWith('Stra')) return 'Straße';
    return s;
  };

  const firstRow = rows[0]!;
  const headerMap = new Map(Object.keys(firstRow).map((h) => [normaliseHeader(h), h]));

  const get = (row: Record<string, string>, header: string): string | null => {
    const rawKey = headerMap.get(header);
    if (!rawKey) return null;
    const val = row[rawKey]?.trim() ?? '';
    return val === '' ? null : val;
  };

  const items: SourceBusinessSeed[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const raw: Record<string, unknown> = {};
    for (const h of Object.keys(row)) {
      raw[normaliseHeader(h)] = row[h] ?? null;
    }

    const websiteUrl = get(row, 'Website');

    if (!websiteUrl) {
      warnings.push(`Row ${i + 1}: no website URL found`);
      continue;
    }

    items.push({
      sourceItemKey: `${prefix}_${i + 1}`,
      sourcePageNumber: get(row, 'Seite'),
      businessName: get(row, 'Name'),
      streetAddress: get(row, 'Straße'),
      postalCode: get(row, 'PLZ'),
      city: get(row, 'Stadt'),
      phone: get(row, 'Telefon'),
      email: get(row, 'Email'),
      websiteUrl,
      category: get(row, 'Branche'),
      sourceProfileUrl: get(row, 'Profil_URL'),
      raw,
    });
  }

  return { items, warnings };
}
