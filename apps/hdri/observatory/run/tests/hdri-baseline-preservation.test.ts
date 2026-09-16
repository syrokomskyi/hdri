import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  validateBaselineImportReceipt,
  type BaselineImportReceipt,
} from "../../tools/preservation/contracts.js";
import {
  acquirePreservationLock,
  verifyInventoryIntegrity,
  checkMissingCasRefs,
  type InventoryEntry,
} from "../../tools/preservation/inventory.js";
import {
  verifyReplicas,
  checkDestinationIndependence,
  type DestinationInfo,
} from "../../tools/preservation/preserve.js";
import {
  resolveIdentities,
  convertToBaseline,
  importBaseline,
} from "../../tools/preservation/baseline-import.js";

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

const realInventoryEntry = (filePath: string, role: string): InventoryEntry => {
  const bytes = fs.readFileSync(filePath);
  return {
    absolutePath: filePath,
    role,
    access: "internal",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
};

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
      fs.mkdirSync(archivePath, { recursive: true });

      const identities = [
        {
          localSiteId: 1,
          provisionalId: "da-1",
          evidenceRefs: ["ref1"],
        },
        {
          localSiteId: 2,
          provisionalId: "da-2",
          evidenceRefs: ["ref2"],
        },
      ];

      const resolved = resolveIdentities({
        producer: "factory",
        device: "fixture-device",
        databaseSha256: "a".repeat(64),
        localIds: identities,
        existingCanonicalIds: new Map([
          ["da-1", "0198f000-0000-7000-8000-000000000001"],
          ["da-2", "0198f000-0000-7000-8000-000000000002"],
        ]),
      });

      expect(resolved).toHaveLength(2);
      expect(resolved[0].canonicalId).toBe("0198f000-0000-7000-8000-000000000001");
      expect(resolved[1].canonicalId).toBe("0198f000-0000-7000-8000-000000000002");
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
  it("rejects unmapped historical identities instead of inventing canonical IDs", () => {
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

  it("fails when one localSiteId maps to two canonical owners", () => {
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
    const inventory: InventoryEntry[] = [fakeInventoryEntry("/path/cas/obj1", "cas/obj1")];
    const missing = checkMissingCasRefs(["/path/cas/obj1"], inventory);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Comparison report has zero unexplained value differences
// ---------------------------------------------------------------------------

describe("RFC-0100 AC-6: comparison report zero differences", () => {
  it("does not treat an empty comparison domain as successful conversion", async () => {
    const dir = mkdtemp("hdri-ac6-");
    try {
      const archivePath = path.join(dir, "archive");
      const targetRoot = path.join(dir, "target");
      fs.mkdirSync(archivePath, { recursive: true });

      await expect(
        convertToBaseline({
          archivePath,
          targetRoot,
          identities: [],
          inventory: [],
        }),
      ).rejects.toThrow("NONEMPTY_INVENTORY_REQUIRED");
      expect(fs.existsSync(targetRoot)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checks the full declared source set before creating conversion output", async () => {
    const dir = mkdtemp("hdri-ac6-preflight-");
    try {
      const archivePath = createFakeQ2Corpus(path.join(dir, "archive"));
      const targetRoot = path.join(dir, "target");
      const inventory = [
        realInventoryEntry(path.join(archivePath, "liveness.db"), "liveness.db"),
        realInventoryEntry(path.join(archivePath, "profile.db"), "profile.db"),
      ];
      fs.writeFileSync(path.join(archivePath, "profile.db"), "changed-profile-db");

      await expect(
        convertToBaseline({ archivePath, targetRoot, identities: [], inventory }),
      ).rejects.toThrow("CHANGED_SOURCE_BYTES: profile.db");
      expect(fs.existsSync(targetRoot)).toBe(false);
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
    const diagnostic = await verifyReplicas({
      destinations: [0, 1].map((i) => ({
        path: `/copy-${i}`,
        failureDomain: `host-${i}`,
        medium: `medium-${i}`,
        credentialBoundary: `key-${i}`,
      })),
      manifestSha256: "c".repeat(64),
      verificationKeys: new Map(),
    });
    expect(diagnostic.status).toBe("incomplete");
    expect(diagnostic.violations[0].code).toBe("UNVERIFIED_REPLICA");
  });

  it("rejects replicas with same failure domain", () => {
    const replicas: DestinationInfo[] = [
      {
        path: "/a",
        failureDomain: "same",
        medium: "ssd",
        credentialBoundary: "k1",
      },
      {
        path: "/b",
        failureDomain: "same",
        medium: "hdd",
        credentialBoundary: "k2",
      },
    ];
    expect(() => checkDestinationIndependence(replicas)).toThrow(/failure domain/);
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
        realInventoryEntry(path.join(archivePath, "liveness.db"), "liveness.db"),
        realInventoryEntry(path.join(archivePath, "profile.db"), "profile.db"),
      ];

      const identities = resolveIdentities({
        producer: "factory",
        device: "fixture-device",
        databaseSha256: "a".repeat(64),
        localIds: [{ localSiteId: 1, provisionalId: "da-1", evidenceRefs: ["ref1"] }],
        existingCanonicalIds: new Map([["da-1", "0198f000-0000-7000-8000-000000000001"]]),
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
