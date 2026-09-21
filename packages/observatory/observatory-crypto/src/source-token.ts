/*
<MODULE_CONTRACT>
<purpose>Parses and validates sourceToken strings used for quarterly cohort naming.</purpose>
<non-goals>
  <item>Does not handle device identity or environment loading.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from device.ts — source token parsing only.</item>
</CHANGE_SUMMARY>
*/

/**
 * Canonical sourceToken format: `yyyy-qn-cc[-extra]`
 *
 *   yyyy  — calendar year (≥ 2020)
 *   qn    — quarter (q1..q4); period boundary is hard-coded by quarter
 *   cc    — ISO 3166-1 alpha-2 country code (e.g. de, at, ch)
 *   extra — optional descriptive suffix (lowercase letters, digits, hyphen)
 *
 * Examples: "2026-q2-de", "2026-q2-de-test1", "2027-q4-at-mannheim-pilot"
 */
const SOURCE_TOKEN_RE = /^(\d{4})-[Qq]([1-4])-([A-Za-z]{2})(-[a-zA-Z0-9-]+)?$/;

export type ParsedSourceToken = {
  readonly raw: string;
  readonly year: number;
  readonly quarter: 1 | 2 | 3 | 4;
  readonly country: string;
  readonly extra: string | null;
};

export function parseSourceToken(token: string): ParsedSourceToken {
  const trimmed = token.trim();
  const m = SOURCE_TOKEN_RE.exec(trimmed);
  if (!m) {
    throw new Error(
      `Invalid sourceToken "${token}". Expected yyyy-qn-cc[-extra], e.g. "2026-q2-de-test1".`,
    );
  }
  const year = parseInt(m[1]!, 10);
  if (year < 2020) throw new Error(`sourceToken year must be ≥ 2020 (got ${year})`);
  return {
    raw: trimmed,
    year,
    quarter: parseInt(m[2]!, 10) as 1 | 2 | 3 | 4,
    country: m[3]!.toLowerCase(),
    extra: m[4]?.slice(1) ?? null,
  };
}

/** Returns the period (`yyyy-qn`) implied by a sourceToken — used by a-contract-ontology. */
export function periodFromSourceToken(token: string): string {
  const p = parseSourceToken(token);
  return `${p.year}-q${p.quarter}`;
}

/**
 * Returns true when a sourceToken belongs to the given period.
 * E.g. periodMatchesToken("2026-q2", "2026-q2-de-test1") === true.
 */
export function periodMatchesToken(period: string, token: string): boolean {
  return periodFromSourceToken(token) === period;
}
