/*
<MODULE_CONTRACT>
<purpose>Defines the deterministic offline HDRI acceptance corpus: types, schema
validation, seeded fixture generation, path safety checks, and case-coverage
reporting. Test-only module — production code must not import fixture policy.</purpose>
<non-goals>
  <item>Does not execute real network requests or browser sessions.</item>
  <item>Does not prove live-source representativeness or production hardware performance.</item>
  <item>Does not replace real preservation, replica independence, or human-label evidence.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0024: Created deterministic offline HDRI acceptance corpus with seeded generation,
  manifest validation, path safety checks, and case-coverage reporting.</item>
</CHANGE_SUMMARY>
*/

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

export const CORPUS_SCHEMA = "hdri-fixture-corpus@1" as const;

// ---------------------------------------------------------------------------
// Case group definitions (from ADR-0024 decision table)
// ---------------------------------------------------------------------------

export interface CaseGroupDef {
  readonly name: string;
  readonly cases: readonly string[];
}

export const CASE_GROUPS: readonly CaseGroupDef[] = [
  {
    name: "source-shape",
    cases: [
      "audited-source-family-1",
      "audited-source-family-2",
      "audited-source-family-3",
      "audited-source-family-4",
      "ordinary-nested-directories",
      "captured-external-origin",
      "html-format",
      "mhtml-format",
      "list-card-noise",
    ],
  },
  {
    name: "historical-identity",
    cases: [
      "two-numeric-id-generations",
      "valid-canonical-map",
      "ambiguous-owner",
      "unknown-observed-time",
    ],
  },
  {
    name: "endpoint",
    cases: [
      "http-only",
      "www-only",
      "redirect-to-subpath",
      "redirect-to-other-origin",
      "head-405",
      "http-429",
      "http-503",
      "transient-dns",
    ],
  },
  {
    name: "content",
    cases: [
      "shared-html-across-origins",
      "invalid-charset",
      "missing-charset",
      "truncated-body",
      "oversized-body",
      "missing-cas",
    ],
  },
  {
    name: "browser",
    cases: [
      "http-error-challenge-page",
      "failed-dependency-preflight",
      "launch-stall",
      "analyze-stall",
      "close-stall",
      "leaked-context-state",
    ],
  },
  {
    name: "execution",
    cases: [
      "clock-rollback",
      "equal-times",
      "stale-lease",
      "duplicate-device-attempt",
      "publication-interruption-1",
      "publication-interruption-2",
    ],
  },
  {
    name: "release",
    cases: [
      "actual-report-schemas",
      "differing-entity-counts",
      "replica-alias",
      "missing-receipt",
      "retry-after-success",
    ],
  },
  {
    name: "privacy",
    cases: [
      "direct-identifiers-csv",
      "json-arrays",
      "small-cells",
      "complementary-suppression",
      "changed-bytes-after-review",
    ],
  },
  {
    name: "recovery",
    cases: [
      "db-access-forbidden",
      "mart-access-forbidden",
      "missing-offline-dependency",
      "corrupted-object",
      "public-key-rotation",
    ],
  },
  {
    name: "continuity",
    cases: [
      "q4-to-q1",
      "delayed-publication",
      "incomplete-predecessor",
      "explicit-gap",
      "idempotent-init",
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixtureEntry {
  readonly id: string;
  readonly caseGroup: string;
  readonly caseName: string;
  readonly contentSha256: string;
  readonly expectedOutcome: string;
  readonly syntheticId: string;
  readonly weight: number;
  readonly path: string;
}

export interface CorpusManifest {
  readonly schema: typeof CORPUS_SCHEMA;
  readonly seed: string;
  readonly sourceRevision: string;
  readonly fixtures: readonly FixtureEntry[];
  readonly caseGroups: readonly CaseGroupDef[];
  readonly digest: string;
}

// ---------------------------------------------------------------------------
// Protected path patterns — fixtures must not reference these
// ---------------------------------------------------------------------------

const PROTECTED_PATTERNS: readonly RegExp[] = [
  /\.input\/batches\//, // Q2 source data
  /\.output\/db\//, // production databases
  /\.output\/frames\//, // production frames
  /\.env$/, // environment files
  /\.env\./, // environment variants
];

function isProtectedPath(p: string): boolean {
  return PROTECTED_PATTERNS.some((re) => re.test(p));
}

// ---------------------------------------------------------------------------
// Deterministic seeded generation
// ---------------------------------------------------------------------------

function seededRng(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const state = h >>> 0;
  let s = state;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticIdFromSeed(seed: string, index: number): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${seed}:${index}`)
    .digest("hex")
    .slice(0, 12);
  return `syn-${hash}`;
}

function contentHashFromSeed(seed: string, caseGroup: string, caseName: string): string {
  return crypto
    .createHash("sha256")
    .update(`${seed}:${caseGroup}:${caseName}`)
    .digest("hex");
}

/**
 * Generate the tiny corpus: at least one fixture per case across all case groups.
 * The seed controls all synthetic IDs, content hashes, and weights deterministically.
 */
export function generateCorpus(seed: string, sourceRevision: string): CorpusManifest {
  const rng = seededRng(seed);
  const fixtures: FixtureEntry[] = [];
  let index = 0;

  for (const group of CASE_GROUPS) {
    for (const caseName of group.cases) {
      const weight = Math.round(rng() * 100) / 100;
      const path = `testing/reliability/fixtures/${group.name}/${caseName}.html`;
      fixtures.push({
        id: `fx-${String(index).padStart(3, "0")}`,
        caseGroup: group.name,
        caseName,
        contentSha256: contentHashFromSeed(seed, group.name, caseName),
        expectedOutcome: weight > 0.5 ? "pass" : "defer",
        syntheticId: syntheticIdFromSeed(seed, index),
        weight,
        path,
      });
      index++;
    }
  }

  const manifestWithoutDigest: Omit<CorpusManifest, "digest"> = {
    schema: CORPUS_SCHEMA,
    seed,
    sourceRevision,
    fixtures,
    caseGroups: CASE_GROUPS,
  };

  const digest = computeManifestDigest(manifestWithoutDigest);

  return { ...manifestWithoutDigest, digest };
}

// ---------------------------------------------------------------------------
// Manifest digest — SHA-256 of the canonical serialization (excluding digest field)
// ---------------------------------------------------------------------------

export function computeManifestDigest(manifest: Omit<CorpusManifest, "digest">): string {
  const canonical = JSON.stringify({
    schema: manifest.schema,
    seed: manifest.seed,
    sourceRevision: manifest.sourceRevision,
    fixtures: [...manifest.fixtures].map((f) => ({
      id: f.id,
      caseGroup: f.caseGroup,
      caseName: f.caseName,
      contentSha256: f.contentSha256,
      expectedOutcome: f.expectedOutcome,
      syntheticId: f.syntheticId,
      weight: f.weight,
      path: f.path,
    })),
    caseGroups: [...manifest.caseGroups].map((g) => ({
      name: g.name,
      cases: [...g.cases],
    })),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validate a corpus manifest against hdri-fixture-corpus@1.
 * Checks schema version, structural integrity, and path safety.
 */
export function validateManifest(manifest: CorpusManifest): ValidationResult {
  const errors: string[] = [];

  if (manifest.schema !== CORPUS_SCHEMA) {
    errors.push(
      `Schema mismatch: expected "${CORPUS_SCHEMA}", got "${manifest.schema}"`,
    );
  }

  if (!manifest.seed || manifest.seed.length === 0) {
    errors.push("Seed must be a non-empty string");
  }

  if (!manifest.sourceRevision || manifest.sourceRevision.length === 0) {
    errors.push("Source revision must be a non-empty string");
  }

  if (manifest.fixtures.length === 0) {
    errors.push("Manifest must contain at least one fixture");
  }

  const seenIds = new Set<string>();
  for (const fx of manifest.fixtures) {
    if (seenIds.has(fx.id)) {
      errors.push(`Duplicate fixture id: ${fx.id}`);
    }
    seenIds.add(fx.id);

    if (!fx.contentSha256 || fx.contentSha256.length !== 64) {
      errors.push(`Fixture ${fx.id} has invalid contentSha256`);
    }

    if (!fx.syntheticId || !fx.syntheticId.startsWith("syn-")) {
      errors.push(`Fixture ${fx.id} has invalid syntheticId`);
    }

    if (isProtectedPath(fx.path)) {
      errors.push(
        `Fixture ${fx.id} references protected path: ${fx.path}`,
      );
    }
  }

  const expectedDigest = computeManifestDigest({
    schema: manifest.schema,
    seed: manifest.seed,
    sourceRevision: manifest.sourceRevision,
    fixtures: manifest.fixtures,
    caseGroups: manifest.caseGroups,
  });
  if (manifest.digest !== expectedDigest) {
    errors.push("Manifest digest mismatch — content was modified after generation");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Case-coverage report
// ---------------------------------------------------------------------------

export interface CaseCoverageReport {
  readonly coveredGroups: readonly string[];
  readonly missingGroups: readonly string[];
  readonly coveredCases: number;
  readonly totalCases: number;
  readonly allGroupsPresent: boolean;
}

/**
 * Generate a coverage report from a corpus manifest.
 * Verifies that every case group from the ADR-0024 decision table is represented.
 */
export function generateCoverageReport(
  manifest: CorpusManifest,
): CaseCoverageReport {
  const fixtureGroups = new Set(manifest.fixtures.map((f) => f.caseGroup));
  const expectedGroups = CASE_GROUPS.map((g) => g.name);

  const covered = expectedGroups.filter((g) => fixtureGroups.has(g));
  const missing = expectedGroups.filter((g) => !fixtureGroups.has(g));

  const totalCases = CASE_GROUPS.reduce((sum, g) => sum + g.cases.length, 0);
  const coveredCases = manifest.fixtures.filter((f) =>
    CASE_GROUPS.some(
      (g) => g.name === f.caseGroup && g.cases.includes(f.caseName),
    ),
  ).length;

  return {
    coveredGroups: covered,
    missingGroups: missing,
    coveredCases,
    totalCases,
    allGroupsPresent: missing.length === 0,
  };
}
