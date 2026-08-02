/**
 * WP12: methodology fingerprint is deterministic, content-sensitive, and immutable once frozen.
 */

import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { migrateObservatory } from "../db/migrate";
import {
  computeMethodologyFingerprint,
  writeRunMethodology,
  type MethodologyInput,
} from "../score/methodology-core";

const base: MethodologyInput = {
  codebookId: "hdri",
  codebookVersion: "1.3.0",
  ontologyVersion: "1.0.0",
  scorerVersion: "0.0.1",
  codebookSource: "dimensions:\n  - id: legal\n",
  ontologySource: "version: 1.0.0\nsignals: {}\n",
};

describe("computeMethodologyFingerprint (WP12)", () => {
  it("is deterministic for identical inputs", () => {
    expect(computeMethodologyFingerprint(base)).toEqual(computeMethodologyFingerprint(base));
  });

  it("changes when the codebook CONTENT changes, even at the same version", () => {
    const a = computeMethodologyFingerprint(base);
    const b = computeMethodologyFingerprint({
      ...base,
      codebookSource: base.codebookSource + "# edit\n",
    });
    expect(b.codebookVersion).toBe(a.codebookVersion); // version unchanged…
    expect(b.codebookSha256).not.toBe(a.codebookSha256); // …but content hash differs
    expect(b.methodologyHash).not.toBe(a.methodologyHash);
  });

  it("changes when the scorer version changes", () => {
    const a = computeMethodologyFingerprint(base);
    const b = computeMethodologyFingerprint({ ...base, scorerVersion: "0.0.2" });
    expect(b.methodologyHash).not.toBe(a.methodologyHash);
  });

  it("handles legacy no-ontology mode with a null ontology hash", () => {
    const fp = computeMethodologyFingerprint({ ...base, ontologySource: null });
    expect(fp.ontologySha256).toBeNull();
    expect(fp.methodologyHash).toBeTruthy();
  });
});

describe("writeRunMethodology (WP12)", () => {
  it("freezes once and never overwrites a run's methodology", () => {
    const db = new Database(":memory:");
    try {
      migrateObservatory(db);

      const first = computeMethodologyFingerprint(base);
      expect(writeRunMethodology(db, "run-1", first, "2026-07-01T00:00:00Z")).toBe(true);

      // A second write for the SAME run (e.g. a different codebook) must be ignored.
      const tampered = computeMethodologyFingerprint({ ...base, codebookSource: "TAMPERED" });
      expect(writeRunMethodology(db, "run-1", tampered, "2026-08-01T00:00:00Z")).toBe(false);

      const row = db
        .prepare(`SELECT methodology_hash, frozen_at FROM run_methodology WHERE run_id = 'run-1'`)
        .get() as { methodology_hash: string; frozen_at: string };
      expect(row.methodology_hash).toBe(first.methodologyHash); // original frozen value survives
      expect(row.frozen_at).toBe("2026-07-01T00:00:00Z");
    } finally {
      db.close();
    }
  });
});
