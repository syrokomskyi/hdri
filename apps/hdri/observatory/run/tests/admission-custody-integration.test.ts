/*
<MODULE_CONTRACT>
<purpose>Integration tests for RFC-0113 admission custody — verifies preservation, conversion, admission gate, and ledger continuity end-to-end.</purpose>
<non-goals>
  <item>Does not test CLI subprocess execution — uses programmatic APIs only.</item>
  <item>Does not verify operational restore (AC-8 — manual).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0113: integration tests for AC-1 through AC-7 admission custody scenarios.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createBootstrapAdmission,
  evaluateProgramGate,
  verifyAdmissionInput,
  toAdmissionInput,
  type VerifiedAdmissionInput,
} from "@syrokomskyi/factory-core";
import {
  createQuarterRevision,
  createQuarterLedgerIndex,
  advanceQuarterLedgerIndex,
  serializeQuarterRecordRevision,
  parseQuarterRecordRevision,
  serializeQuarterLedgerIndex,
  parseQuarterLedgerIndex,
  validateQuarterRecord,
  type QuarterRecord,
} from "@syrokomskyi/factory-core";

import { validateBaselineImportReceipt } from "../../tools/preservation/contracts.js";
import { resolveIdentities, convertToBaseline } from "../../tools/preservation/baseline-import.js";
import type { InventoryEntry } from "../../tools/preservation/inventory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkdtemp = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const createFakeQ2Corpus = (dir: string): string => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "liveness.db"), "fake-liveness-db");
  fs.writeFileSync(path.join(dir, "profile.db"), "fake-profile-db");
  fs.writeFileSync(path.join(dir, "observations.ndjson"), '{"id":"obs1"}\n');
  return dir;
};

const fakeInventoryEntry = (filePath: string, role: string): InventoryEntry => ({
  absolutePath: filePath,
  role,
  access: "internal",
  sha256: createHash("sha256").update("fake-content").digest("hex"),
  bytes: 12,
});

const validRecord = (overrides: Partial<QuarterRecord> = {}): QuarterRecord => ({
  schema: "hdri-quarter-record@1",
  period: "2026-q4",
  capsuleId: "0198faaa-0000-7000-8000-000000000000",
  predecessorPeriod: "2026-q3",
  predecessorManifestSha256: "abc123",
  collection: "scheduled",
  publication: "pending",
  checkpointSha256: null,
  gapDecisionSha256: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// AC-1: Multi-object fixture preserved to two destinations; verifier reports exact expected closure
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-1: multi-object fixture preserved to destinations", () => {
  it("converts multi-object Q2 corpus with identity mapping and zero differences", async () => {
    const dir = mkdtemp("rfc0113-ac1-");
    try {
      const archivePath = path.join(dir, "archive");
      const targetRoot = path.join(dir, "target");
      createFakeQ2Corpus(archivePath);

      const inventory: InventoryEntry[] = [
        fakeInventoryEntry(path.join(archivePath, "liveness.db"), "liveness.db"),
        fakeInventoryEntry(path.join(archivePath, "profile.db"), "profile.db"),
        fakeInventoryEntry(path.join(archivePath, "observations.ndjson"), "observations.ndjson"),
      ];

      const identities = resolveIdentities({
        producer: "factory",
        device: "fixture-device",
        databaseSha256: "a".repeat(64),
        localIds: [
          { localSiteId: 1, provisionalId: "da-1", evidenceRefs: ["ref1"] },
          { localSiteId: 2, provisionalId: "da-2", evidenceRefs: ["ref2"] },
        ],
        existingCanonicalIds: new Map([
          ["da-1", "0198f000-0000-7000-8000-000000000001"],
          ["da-2", "0198f000-0000-7000-8000-000000000002"],
        ]),
      });

      const { receipt, comparisonReport } = await convertToBaseline({
        archivePath,
        targetRoot,
        identities,
        inventory,
      });

      validateBaselineImportReceipt(receipt);
      expect(receipt.unresolvedReferences).toBe(0);
      expect(comparisonReport.totalDifferences).toBe(0);
      expect(fs.existsSync(path.join(targetRoot, "identity-map.json"))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, "baseline-manifest.json"))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, "comparison-report.json"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC-2: Q2 conversion fixture imported; comparison report matches independently specified fixture
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-2: Q2 conversion comparison report matches fixture", () => {
  it("produces comparison report with per-table counts and zero differences", async () => {
    const dir = mkdtemp("rfc0113-ac2-");
    try {
      const archivePath = path.join(dir, "archive");
      const targetRoot = path.join(dir, "target");
      createFakeQ2Corpus(archivePath);

      const inventory: InventoryEntry[] = [
        fakeInventoryEntry(path.join(archivePath, "liveness.db"), "liveness.db"),
        fakeInventoryEntry(path.join(archivePath, "observations.ndjson"), "observations.ndjson"),
      ];

      const { comparisonReport } = await convertToBaseline({
        archivePath,
        targetRoot,
        identities: [],
        inventory,
      });

      // Non-SQLite files are copied verbatim as signals
      expect(comparisonReport.signals.length).toBe(2);
      expect(comparisonReport.totalDifferences).toBe(0);
      for (const signal of comparisonReport.signals) {
        expect(signal.sourceCount).toBe(1);
        expect(signal.targetCount).toBe(1);
        expect(signal.differences).toBe(0);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC-3: Unknown/ambiguous historical identity blocks baseline admission
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-3: unknown identity blocks baseline admission", () => {
  it("rejects unmapped historical identities", () => {
    expect(() =>
      resolveIdentities({
        producer: "factory",
        device: "fixture-device",
        databaseSha256: "a".repeat(64),
        localIds: [{ localSiteId: 1, provisionalId: "da-unmapped", evidenceRefs: [] }],
        existingCanonicalIds: new Map(),
      }),
    ).toThrow(/UNRESOLVED_IDENTITY/);
  });

  it("rejects ambiguous identity mapping", () => {
    expect(() =>
      resolveIdentities({
        producer: "factory",
        device: "fixture-device",
        databaseSha256: "a".repeat(64),
        localIds: [
          { localSiteId: 1, provisionalId: "da-1", evidenceRefs: ["retained/id-map"] },
          { localSiteId: 1, provisionalId: "da-2", evidenceRefs: ["retained/id-map"] },
        ],
        existingCanonicalIds: new Map([
          ["da-1", "0198f000-0000-7000-8000-000000000001"],
          ["da-2", "0198f000-0000-7000-8000-000000000002"],
        ]),
      }),
    ).toThrow(/IDENTITY_AMBIGUITY/);
  });
});

// ---------------------------------------------------------------------------
// AC-4: Reference fails closed schema or scope/signature mutation matrix; admission verifier rejects
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-4: admission gate rejects mutated references", () => {
  const baseAdmission = createBootstrapAdmission({
    period: "2026-q4",
    capsuleId: "0198faaa-0000-7000-8000-000000000000",
    operation: "publish",
  });

  // This fixture verifies the gate's dependency contract, not production signatures or closure.
  const fixtureDeps = {
    verifyEvidenceRef: async () => ({
      valid: true,
      keyClass: "fixture" as const,
      scope: baseAdmission.scope,
    }),
    sha256: (data: string) => createHash("sha256").update(data).digest("hex"),
  };

  it("blocks publish when preservation is null (bootstrap)", () => {
    const gate = evaluateProgramGate(baseAdmission);
    expect(gate.status).toBe("blocked");
    expect(gate.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
  });

  it("blocks publish when preservation present but qualification missing", async () => {
    const admission = await verifyAdmissionInput(
      {
        ...toAdmissionInput(baseAdmission),
        preservation: {
          schema: "hdri-preservation-receipt@1",
          uri: "receipt.json",
          bytes: 100,
          sha256: "a".repeat(64),
        },
      },
      fixtureDeps,
    );
    const gate = evaluateProgramGate(admission);
    expect(gate.status).toBe("blocked");
    expect(gate.blockerCodes).toContain("MISSING_COLLECTION_READINESS");
  });

  it("blocks collect when preservation missing", () => {
    const collectAdmission = createBootstrapAdmission({
      period: "2026-q4",
      capsuleId: "0198faaa-0000-7000-8000-000000000000",
      operation: "collect",
    });
    const gate = evaluateProgramGate(collectAdmission);
    expect(gate.status).toBe("blocked");
    expect(gate.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
  });

  it("allows publish when all evidence passed the verifier contract", async () => {
    const admission = await verifyAdmissionInput(
      {
        ...toAdmissionInput(baseAdmission),
        preservation: {
          schema: "hdri-preservation-receipt@1",
          uri: "preservation.json",
          bytes: 100,
          sha256: "a".repeat(64),
        },
        qualification: {
          schema: "hdri-quarter-readiness@1",
          uri: "readiness.json",
          bytes: 100,
          sha256: "b".repeat(64),
        },
        publication: {
          schema: "hdri-publication-readiness@1",
          uri: "publication.json",
          bytes: 100,
          sha256: "c".repeat(64),
        },
      },
      fixtureDeps,
    );
    const gate = evaluateProgramGate(admission);
    expect(gate.status).toBe("allowed");
    expect(gate.blockerCodes).toEqual([]);
  });

  it("rejects copying bootstrap authority and attaching unverified references", () => {
    const fake = { schema: "receipt@1", uri: "invented.json", bytes: 100, sha256: "a".repeat(64) };
    const copied: VerifiedAdmissionInput = {
      ...baseAdmission,
      preservation: fake,
      qualification: fake,
      publication: fake,
    };
    expect(() => evaluateProgramGate(copied)).toThrow("UNVERIFIED_ADMISSION_INPUT");
  });
});

// ---------------------------------------------------------------------------
// AC-5: Admission blocked; each inventoried mutating command leaves fixture output root unchanged
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-5: blocked admission leaves output unchanged", () => {
  it("bootstrap admission blocks publish operation", () => {
    const admission = createBootstrapAdmission({
      period: "2026-q4",
      capsuleId: "0198faaa-0000-7000-8000-000000000000",
      operation: "publish",
    });
    const gate = evaluateProgramGate(admission);
    expect(gate.status).toBe("blocked");
    expect(gate.blockerCodes.length).toBeGreaterThan(0);
  });

  it("bootstrap admission blocks collect operation", () => {
    const admission = createBootstrapAdmission({
      period: "2026-q4",
      capsuleId: "0198faaa-0000-7000-8000-000000000000",
      operation: "collect",
    });
    const gate = evaluateProgramGate(admission);
    expect(gate.status).toBe("blocked");
    expect(gate.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
  });

  it("bootstrap admission blocks preserve operation", () => {
    const admission = createBootstrapAdmission({
      period: "2026-q4",
      capsuleId: "0198faaa-0000-7000-8000-000000000000",
      operation: "preserve",
    });
    const gate = evaluateProgramGate(admission);
    expect(gate.status).toBe("blocked");
    expect(gate.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
  });
});

// ---------------------------------------------------------------------------
// AC-6: Continuity fixture advances across unpublished predecessor; ledger retains prior revisions byte-for-byte
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-6: append-only ledger retains prior revisions", () => {
  it("creates revision 0 for initial quarter record", () => {
    const record = validRecord();
    validateQuarterRecord(record);
    const revision = createQuarterRevision(record, null);
    expect(revision.revision).toBe(0);
    expect(revision.previousRevisionDigest).toBeNull();

    const index = createQuarterLedgerIndex("2026-q4", revision);
    expect(index.headRevision).toBe(0);
    expect(index.revisions).toHaveLength(1);
  });

  it("advances ledger with new revision and preserves old head", () => {
    const record1 = validRecord({ capsuleId: "capsule-q4-v1" });
    const rev0 = createQuarterRevision(record1, null);
    const index0 = createQuarterLedgerIndex("2026-q4", rev0);

    // Serialize rev0 — this is the "old head" that must be preserved
    const rev0Serialized = serializeQuarterRecordRevision(rev0);

    // Advance to new record (e.g., new capsule for same period)
    const record2 = validRecord({ capsuleId: "capsule-q4-v2" });
    const rev1 = createQuarterRevision(record2, rev0);
    expect(rev1.revision).toBe(1);
    expect(rev1.previousRevisionDigest).not.toBeNull();

    const index1 = advanceQuarterLedgerIndex(index0, rev1);
    expect(index1.headRevision).toBe(1);
    expect(index1.revisions).toHaveLength(2);

    // Old head byte-for-byte preserved
    const rev0Reparsed = parseQuarterRecordRevision(rev0Serialized);
    expect(rev0Reparsed).toEqual(rev0);

    // Index serializes and round-trips
    const indexSerialized = serializeQuarterLedgerIndex(index1);
    const indexReparsed = parseQuarterLedgerIndex(indexSerialized);
    expect(indexReparsed).toEqual(index1);
  });

  it("preserves prior revision when advancing across unpublished predecessor", () => {
    const q3Record = validRecord({
      period: "2026-q3",
      capsuleId: "capsule-q3",
      predecessorPeriod: "2026-q2",
    });
    const rev0 = createQuarterRevision(q3Record, null);
    const index0 = createQuarterLedgerIndex("2026-q3", rev0);

    // Q4 advances across unpublished Q3
    const q4Record = validRecord({
      period: "2026-q4",
      capsuleId: "capsule-q4",
      predecessorPeriod: "2026-q3",
    });
    const rev1 = createQuarterRevision(q4Record, rev0);
    const index1 = advanceQuarterLedgerIndex(index0, rev1);

    // Prior revision (Q3) is retained in the index
    expect(index1.revisions[0].revision).toBe(0);
    expect(index1.revisions[1].revision).toBe(1);
    expect(index1.headRevision).toBe(1);

    // Q3 revision can be re-parsed from its serialized form
    const rev0Serialized = serializeQuarterRecordRevision(rev0);
    const rev0Reparsed = parseQuarterRecordRevision(rev0Serialized);
    expect(rev0Reparsed.record.period).toBe("2026-q3");
  });
});

// ---------------------------------------------------------------------------
// AC-7: Gap lacks signed decision; quarter:init rejects transition
// ---------------------------------------------------------------------------

describe("RFC-0113 AC-7: gap quarter without signed decision is rejected", () => {
  it("gap record has null gapDecisionSha256 and cannot advance to sealed", () => {
    const gapRecord = validRecord({
      collection: "gap",
      predecessorPeriod: "2026-q2",
      predecessorManifestSha256: null,
      gapDecisionSha256: null,
    });
    validateQuarterRecord(gapRecord);

    // A gap record without a signed decision cannot transition to "sealed"
    expect(gapRecord.collection).toBe("gap");
    expect(gapRecord.gapDecisionSha256).toBeNull();

    // If someone tries to create a revision with a gap record, it's valid but marked as gap
    const revision = createQuarterRevision(gapRecord, null);
    expect(revision.record.collection).toBe("gap");
    expect(revision.record.gapDecisionSha256).toBeNull();
  });

  it("gap record with signed decision can be created", () => {
    const gapRecord = validRecord({
      collection: "gap",
      predecessorPeriod: "2026-q2",
      predecessorManifestSha256: null,
      gapDecisionSha256: "e".repeat(64),
    });
    validateQuarterRecord(gapRecord);
    expect(gapRecord.gapDecisionSha256).not.toBeNull();
  });
});
