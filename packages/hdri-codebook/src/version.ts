/**
 * Codebook versioning helpers.
 *
 * Format: "MAJOR.MINOR.PATCH"
 *   MAJOR → incompatible change (indicator removed, dimension renamed,
 *           gewerk-group mapping rewritten). Scores across MAJOR versions
 *           are NOT comparable.
 *   MINOR → additive change (new indicator with weight 0 by default,
 *           new dimension disabled). Scores stay comparable.
 *   PATCH → description or typo fix, no scoring impact.
 */

export type SemVer = {
  major: number;
  minor: number;
  patch: number;
};

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export const parseSemVer = (s: string): SemVer => {
  const m = s.trim().match(SEMVER_RE);
  if (!m) throw new Error(`Invalid codebook version: "${s}" (expected MAJOR.MINOR.PATCH)`);
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
};

export const formatSemVer = (v: SemVer): string => `${v.major}.${v.minor}.${v.patch}`;

/**
 * `a` and `b` are score-compatible iff they share the same MAJOR.
 * Used by scoring-run tooling to refuse cross-MAJOR comparisons.
 */
export const isScoreCompatible = (a: string, b: string): boolean => {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);
  return va.major === vb.major;
};

/**
 * Returns the MAJOR portion — used as a short cohort-stable key
 * (e.g. `codebookMajor` column in site_cohorts).
 */
export const majorOf = (version: string): string => String(parseSemVer(version).major);
