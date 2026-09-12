import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CASE_GROUPS,
  CORPUS_SCHEMA,
  computeManifestDigest,
  generateCorpus,
  generateCoverageReport,
  validateManifest,
} from "../testing/reliability/corpus-manifest";

const SEED = "hdri-reliability-2026-q3";
const SOURCE_REVISION = "bd08005d11";

describe("ADR-0024 AC-1: deterministic seed produces identical manifest digest", () => {
  it("generates the same digest when the same seed is used twice", () => {
    const a = generateCorpus(SEED, SOURCE_REVISION);
    const b = generateCorpus(SEED, SOURCE_REVISION);
    expect(a.digest).toBe(b.digest);
  });

  it("produces a different digest when the seed changes", () => {
    const a = generateCorpus(SEED, SOURCE_REVISION);
    const b = generateCorpus("different-seed", SOURCE_REVISION);
    expect(a.digest).not.toBe(b.digest);
  });
});

describe("ADR-0024 AC-2: manifest validates against hdri-fixture-corpus@1", () => {
  it("validates a correctly generated manifest", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const result = validateManifest(manifest);
    expect(result.valid, result.errors.join("; ")).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a manifest with wrong schema version", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const bad = { ...manifest, schema: "hdri-fixture-corpus@0" } as unknown as typeof manifest;
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Schema mismatch"))).toBe(true);
  });

  it("rejects a manifest with a tampered digest", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const bad = { ...manifest, digest: "0".repeat(64) };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("digest mismatch"))).toBe(true);
  });
});

describe("ADR-0024 AC-3: protected path references fail validation", () => {
  it("rejects a fixture referencing Q2 batch data", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const badFixture = {
      ...manifest.fixtures[0],
      path: ".input/batches/q2-source/data.csv",
    };
    const bad = {
      ...manifest,
      fixtures: [badFixture, ...manifest.fixtures.slice(1)],
    };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("protected path"))).toBe(true);
  });

  it("rejects a fixture referencing production output database", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const badFixture = {
      ...manifest.fixtures[0],
      path: ".output/db/liveness-2026-q3.db",
    };
    const bad = {
      ...manifest,
      fixtures: [badFixture, ...manifest.fixtures.slice(1)],
    };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("protected path"))).toBe(true);
  });

  it("rejects a fixture referencing .env", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const badFixture = {
      ...manifest.fixtures[0],
      path: ".env",
    };
    const bad = {
      ...manifest,
      fixtures: [badFixture, ...manifest.fixtures.slice(1)],
    };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("protected path"))).toBe(true);
  });
});

describe("ADR-0024 AC-4: case-coverage report includes every case group", () => {
  it("covers all 10 case groups from the ADR decision table", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const report = generateCoverageReport(manifest);
    expect(report.allGroupsPresent, `Missing groups: ${report.missingGroups.join(", ")}`).toBe(
      true,
    );
    expect(report.missingGroups).toHaveLength(0);
  });

  it("covers every case within each group", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const report = generateCoverageReport(manifest);
    expect(report.coveredCases).toBe(report.totalCases);
  });

  it("detects a missing case group", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const trimmed = {
      ...manifest,
      fixtures: manifest.fixtures.filter((f) => f.caseGroup !== "privacy"),
    };
    const report = generateCoverageReport(trimmed);
    expect(report.allGroupsPresent).toBe(false);
    expect(report.missingGroups).toContain("privacy");
  });

  it("case group count matches ADR-0024 decision table", () => {
    expect(CASE_GROUPS).toHaveLength(10);
  });
});

describe("ADR-0024 AC-5: test-corpus guide documents limits under ADR-0024 marker", () => {
  it("README contains ADR-0024 marker", () => {
    const readmePath = join(__dirname, "..", "testing", "reliability", "README.md");
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("ADR-0024");
  });

  it("README documents corpus limits", () => {
    const readmePath = join(__dirname, "..", "testing", "reliability", "README.md");
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("cannot");
    expect(content).toContain("Limits");
  });
});

describe("corpus manifest additional properties", () => {
  it("schema constant is hdri-fixture-corpus@1", () => {
    expect(CORPUS_SCHEMA).toBe("hdri-fixture-corpus@1");
  });

  it("generated manifest has correct schema", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    expect(manifest.schema).toBe(CORPUS_SCHEMA);
  });

  it("all fixture synthetic IDs start with syn-", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    for (const fx of manifest.fixtures) {
      expect(fx.syntheticId).toMatch(/^syn-[0-9a-f]{12}$/);
    }
  });

  it("all fixture content hashes are 64-char hex", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    for (const fx of manifest.fixtures) {
      expect(fx.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("digest is recomputable and matches", () => {
    const manifest = generateCorpus(SEED, SOURCE_REVISION);
    const recomputed = computeManifestDigest({
      schema: manifest.schema,
      seed: manifest.seed,
      sourceRevision: manifest.sourceRevision,
      fixtures: manifest.fixtures,
      caseGroups: manifest.caseGroups,
    });
    expect(recomputed).toBe(manifest.digest);
  });
});
