import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";

import { validateBaselineImportReceipt, type BaselineImportReceipt } from "../../tools/preservation/contracts.js";
import {
  acquirePreservationLock,
  inventorySources,
  verifyInventoryIntegrity,
  checkMissingCasRefs,
  type InventoryEntry,
} from "../../tools/preservation/inventory.js";
import {
  preserveQ2,
  verifyReplicas,
  checkReplicaIndependence,
  type ReplicaInfo,
} from "../../tools/preservation/preserve.js";
import {
  resolveIdentities,
  convertToBaseline,
  importBaseline,
} from "../../tools/preservation/baseline-import.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkdtemp = (prefix: string): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), prefix));

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

const fakeReceipt = (overrides: Partial<BaselineImportReceipt> = {}): BaselineImportReceipt => ({
  schema: "hdri-baseline-import@1",
  period: "2026-q2",
  sourceInventorySha256: createHash("sha256").update("src").digest("hex"),
  identityMapSha256: createHash("sha256").update("ids").digest("hex"),
  conversionImplementationSha256: createHash("sha256").update("impl").digest("hex"),
  currentBaselineManifestSha256: createHash("sha256").update("manifest").digest("hex"),
  unresolvedReferences: 0,
  comparisonReportSha256: createHash("sha256").update("report").digest("hex"),
  ...overrides,
});

// ---------------------------------------------------------------------------
// AC-1: Import preserves every mapped canonical asset ID
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-1: baseline import preserves canonical asset IDs", () => {
  it("preserves every mapped canonical asset ID when importing into empty target", () => {
    const dir = mkdtemp("hdri-ac1-");
    try {
      const archivePath = path.join(dir, "archive");
      const targetRoot = path.join(dir, "target");
      fs.mkdirSync(archivePath, { recursive: true });

      const identities = [
        { producer: "factory", databaseSha256: "abc", localSiteId: 1, provisionalId: "da-1", evidenceRefs: ["ref1"] },
        { producer: "factory", databaseSha256: "abc", localSiteId: 2, provisionalId: "da-2", evidenceRefs: ["ref2"] },
      ];

      const resolved = resolveIdentities({
        archivePath,
        producer: "factory",
        databaseSha256: "abc",
        localIds: identities,
        existingCanonicalIds: new Map([
          ["da-1", "canonical-uuid-1"],
          ["da-2", "canonical-uuid-2"],
        ]),
      });

      expect(resolved).toHaveLength(2);
      expect(resolved[0].canonicalId).toBe("canonical-uuid-1");
      expect(resolved[1].canonicalId).toBe("canonical-uuid-2");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC-2: BaselineImportReceipt validates against hdri-baseline-import@1
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-2: receipt validates against hdri-baseline-import@1", () => {
  it("validates a correct receipt", () => {
    const receipt = fakeReceipt();
    expect(() => validateBaselineImportReceipt(receipt)).not.toThrow();
  });

  it("rejects wrong schema", () => {
    const receipt = fakeReceipt({ schema: "hdri-baseline-import@2" as "hdri-baseline-import@1" });
    expect(() => validateBaselineImportReceipt(receipt)).toThrow(/schema/);
  });

  it("rejects wrong period", () => {
    const receipt = fakeReceipt({ period: "2026-q3" as "2026-q2" });
    expect(() => validateBaselineImportReceipt(receipt)).toThrow(/period/);
  });

  it("rejects invalid SHA-256", () => {
    const receipt = fakeReceipt({ sourceInventorySha256: "not-hex" });
    expect(() => validateBaselineImportReceipt(receipt)).toThrow(/sourceInventorySha256/);
  });
});

// ---------------------------------------------------------------------------
// AC-3: Ambiguous identity → baseline admission fails
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-3: ambiguous identity blocks admission", () => {
  it("fails when one localSiteId maps to two canonical owners", () => {
    expect(() =>
      resolveIdentities({
        archivePath: "/tmp",
        producer: "factory",
        databaseSha256: "abc",
        localIds: [
          { localSiteId: 1, provisionalId: "da-1", evidenceRefs: [] },
          { localSiteId: 1, provisionalId: "da-2", evidenceRefs: [] },
        ],
        existingCanonicalIds: new Map([
          ["da-1", "canonical-uuid-1"],
          ["da-2", "canonical-uuid-2"],
        ]),
      }),
    ).toThrow(/IDENTITY_AMBIGUITY/);
  });
});

// ---------------------------------------------------------------------------
// AC-4: Protected-source inventory has same content digests after preservation
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-4: inventory integrity preserved", () => {
  it("passes when digests match", () => {
    const entries: InventoryEntry[] = [
      fakeInventoryEntry("/path/a", "a.db"),
      fakeInventoryEntry("/path/b", "b.db"),
    ];
    expect(() => verifyInventoryIntegrity(entries, entries)).not.toThrow();
  });

  it("fails when a digest changed", () => {
    const original: InventoryEntry[] = [fakeInventoryEntry("/path/a", "a.db")];
    const modified: InventoryEntry[] = [
      { ...original[0], sha256: createHash("sha256").update("different").digest("hex") },
    ];
    expect(() => verifyInventoryIntegrity(original, modified)).toThrow(/Content digest changed/);
  });
});

// ---------------------------------------------------------------------------
// AC-5: Missing CAS object → preservation gate incomplete
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-5: missing CAS references block gate", () => {
  it("reports missing CAS refs", () => {
    const inventory: InventoryEntry[] = [
      fakeInventoryEntry("/path/cas/obj1", "cas/obj1"),
      fakeInventoryEntry("/path/cas/obj2", "cas/obj2"),
    ];
    const missing = checkMissingCasRefs(["/path/cas/obj3"], inventory);
    expect(missing).toEqual(["/path/cas/obj3"]);
  });

  it("passes when all CAS refs present", () => {
    const inventory: InventoryEntry[] = [
      fakeInventoryEntry("/path/cas/obj1", "cas/obj1"),
    ];
    const missing = checkMissingCasRefs(["/path/cas/obj1"], inventory);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Comparison report has zero unexplained value differences
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-6: comparison report zero differences", () => {
  it("produces zero-difference comparison report from conversion", async () => {
    const dir = mkdtemp("hdri-ac6-");
    try {
      const archivePath = path.join(dir, "archive");
      const targetRoot = path.join(dir, "target");
      fs.mkdirSync(archivePath, { recursive: true });

      const { comparisonReport } = await convertToBaseline({
        archivePath,
        targetRoot,
        identities: [],
        inventory: [],
      });

      expect(comparisonReport.totalDifferences).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC-7: Fewer than 3 independent complete copies → gate incomplete
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-7: replica verification requires 3 independent copies", () => {
  it("fails when fewer than 3 replicas", async () => {
    const dir = mkdtemp("hdri-ac7-");
    try {
      const archivePath = path.join(dir, "archive");
      fs.mkdirSync(archivePath, { recursive: true });

      // Write a receipt with only 2 replicas
      const receipt = {
        schema: "hdri-replica-receipt@1",
        period: "2026-q2",
        replicas: [
          { path: "/fake/1", sha256: "a".repeat(64), bytes: 1, failureDomain: "a", medium: "ssd", credentialBoundary: "k1" },
          { path: "/fake/2", sha256: "b".repeat(64), bytes: 1, failureDomain: "b", medium: "hdd", credentialBoundary: "k2" },
        ],
        contentManifestSha256: "c".repeat(64),
        signatureSha256: "c".repeat(64),
      };
      fs.writeFileSync(
        path.join(archivePath, "replica-receipt.json"),
        JSON.stringify(receipt, null, 2),
      );

      const diagnostic = await verifyReplicas({
        archivePath,
        full: false,
        expectedReplicaCount: 3,
      });

      expect(diagnostic.status).toBe("incomplete");
      expect(diagnostic.violations[0].code).toBe("UNVERIFIED_REPLICA");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects replicas with same failure domain", () => {
    const replicas: ReplicaInfo[] = [
      { path: "/a", sha256: "x", bytes: 1, failureDomain: "same", medium: "ssd", credentialBoundary: "k1" },
      { path: "/b", sha256: "y", bytes: 1, failureDomain: "same", medium: "hdd", credentialBoundary: "k2" },
    ];
    expect(() => checkReplicaIndependence(replicas)).toThrow(/failure domain/);
  });
});

// ---------------------------------------------------------------------------
// Preservation lock tests
// ---------------------------------------------------------------------------

describe("RFC-0100 preservation lock", () => {
  it("acquires and releases lock", async () => {
    const dir = mkdtemp("hdri-lock-");
    try {
      const lock = await acquirePreservationLock(dir);
      expect(fs.existsSync(path.join(dir, ".preserve-lock.json"))).toBe(true);
      await lock.release();
      expect(fs.existsSync(path.join(dir, ".preserve-lock.json"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects second lock on same root", async () => {
    const dir = mkdtemp("hdri-lock2-");
    try {
      await acquirePreservationLock(dir);
      await expect(acquirePreservationLock(dir)).rejects.toThrow(/LOCK_VIOLATION/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Full baseline import integration
// ---------------------------------------------------------------------------

describe("RFC-0100 full baseline import", () => {
  it("imports baseline and produces valid receipt", async () => {
    const dir = mkdtemp("hdri-import-");
    try {
      const archivePath = path.join(dir, "archive");
      const targetRoot = path.join(dir, "target");
      createFakeQ2Corpus(archivePath);

      const inventory: InventoryEntry[] = [
        fakeInventoryEntry(path.join(archivePath, "liveness.db"), "liveness.db"),
        fakeInventoryEntry(path.join(archivePath, "profile.db"), "profile.db"),
      ];

      const identities = resolveIdentities({
        archivePath,
        producer: "factory",
        databaseSha256: "abc",
        localIds: [{ localSiteId: 1, provisionalId: "da-1", evidenceRefs: ["ref1"] }],
        existingCanonicalIds: new Map([["da-1", "canonical-uuid-1"]]),
      });

      const receipt = await importBaseline({
        archivePath,
        targetRoot,
        inventory,
        identities,
      });

      validateBaselineImportReceipt(receipt);
      expect(receipt.unresolvedReferences).toBe(0);
      expect(fs.existsSync(path.join(targetRoot, "identity-map.json"))).toBe(true);
      expect(fs.existsSync(path.join(targetRoot, "baseline-manifest.json"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
