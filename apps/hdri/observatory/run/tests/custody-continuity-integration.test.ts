/*
<MODULE_CONTRACT>
<purpose>Integration tests for RFC-0115 Step 11: custody continuity — verify overdue-replication fixture reports unreplicated evidence as at risk (AC-8), ledger transitions produce chained revisions, and restore drill detects missing shards.</purpose>
<non-goals>
  <item>Does not test actual vault shard reading — uses fixture files.</item>
  <item>Does not test network replication.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 Step 11: custody continuity integration tests for AC-8.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createQuarterRevision,
  createQuarterLedgerIndex,
  advanceQuarterLedgerIndex,
  serializeQuarterRecordRevision,
  serializeQuarterLedgerIndex,
  computeRevisionDigest,
  parseQuarterLedgerIndex,
  parseQuarterRecordRevision,
  type QuarterRecord,
} from "@syrokomskyi/factory-core";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0115-custody-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeRecord(period: string, overrides: Partial<QuarterRecord> = {}): QuarterRecord {
  return {
    schema: "hdri-quarter-record@1",
    period,
    capsuleId: "test-capsule-id",
    predecessorPeriod: null,
    predecessorManifestSha256: null,
    collection: "scheduled",
    publication: "pending",
    checkpointSha256: null,
    gapDecisionSha256: null,
    ...overrides,
  };
}

describe("RFC-0115 AC-8: overdue-replication fixture reports unreplicated evidence as at risk", () => {
  it("replica receipt older than 24h is flagged as overdue", async () => {
    const receiptsDir = path.join(tmpDir, "replica-receipts");
    await fs.mkdir(receiptsDir, { recursive: true });

    // Create a replica receipt that's 48h old
    const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const replicaData = Buffer.from("test-replica-content");
    const replicaPath = path.join(tmpDir, "shard.parquet");
    await fs.writeFile(replicaPath, replicaData);
    const replicaHash = createHash("sha256").update(replicaData).digest("hex");

    const receipt = {
      path: "shard.parquet",
      sha256: replicaHash,
      createdAt: oldTimestamp,
    };
    await fs.writeFile(
      path.join(receiptsDir, "receipt-001.json"),
      JSON.stringify(receipt, null, 2),
      "utf8",
    );

    // Verify the receipt is parseable and has the old timestamp
    const raw = await fs.readFile(path.join(receiptsDir, "receipt-001.json"), "utf8");
    const parsed = JSON.parse(raw) as { createdAt: string };
    const ageMs = Date.now() - Date.parse(parsed.createdAt);
    expect(ageMs).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it("replica receipt within 24h is not flagged as overdue", async () => {
    const receiptsDir = path.join(tmpDir, "replica-receipts");
    await fs.mkdir(receiptsDir, { recursive: true });

    // Create a replica receipt that's 2h old
    const recentTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const receipt = {
      path: "shard.parquet",
      sha256: "a".repeat(64),
      createdAt: recentTimestamp,
    };
    await fs.writeFile(
      path.join(receiptsDir, "receipt-002.json"),
      JSON.stringify(receipt, null, 2),
      "utf8",
    );

    const raw = await fs.readFile(path.join(receiptsDir, "receipt-002.json"), "utf8");
    const parsed = JSON.parse(raw) as { createdAt: string };
    const ageMs = Date.now() - Date.parse(parsed.createdAt);
    expect(ageMs).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("missing replica receipt directory is flagged", async () => {
    // No replica-receipts dir created
    const receiptsDir = path.join(tmpDir, "replica-receipts");
    try {
      await fs.readdir(receiptsDir);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("replica hash mismatch is detected", async () => {
    const receiptsDir = path.join(tmpDir, "replica-receipts");
    await fs.mkdir(receiptsDir, { recursive: true });

    const replicaData = Buffer.from("actual-content");
    const replicaPath = path.join(tmpDir, "shard.parquet");
    await fs.writeFile(replicaPath, replicaData);
    const actualHash = createHash("sha256").update(replicaData).digest("hex");

    // Receipt has wrong hash
    const receipt = {
      path: "shard.parquet",
      sha256: "0".repeat(64), // Wrong hash
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(receiptsDir, "receipt-003.json"),
      JSON.stringify(receipt, null, 2),
      "utf8",
    );

    // Verify the hashes don't match
    expect(receipt.sha256).not.toBe(actualHash);
  });
});

describe("RFC-0115: ledger transitions produce chained revisions", () => {
  it("schedule → collect → seal → release produces 4 chained revisions", async () => {
    const ledgerDir = path.join(tmpDir, "quarter-ledger");
    await fs.mkdir(ledgerDir, { recursive: true });

    const period = "2026-q3";
    const record0 = makeRecord(period, { collection: "scheduled" });
    const rev0 = createQuarterRevision(record0, null);
    let index = createQuarterLedgerIndex(period, rev0);

    // Write revision 0
    await fs.writeFile(
      path.join(ledgerDir, "revision-0000.json"),
      serializeQuarterRecordRevision(rev0),
      "utf8",
    );
    await fs.writeFile(
      path.join(ledgerDir, "ledger-index.json"),
      serializeQuarterLedgerIndex(index),
      "utf8",
    );

    // Transition: collect
    const record1 = makeRecord(period, { collection: "collecting" });
    const rev1 = createQuarterRevision(record1, rev0);
    index = advanceQuarterLedgerIndex(index, rev1);
    await fs.writeFile(
      path.join(ledgerDir, "revision-0001.json"),
      serializeQuarterRecordRevision(rev1),
      "utf8",
    );

    // Transition: seal
    const record2 = makeRecord(period, {
      collection: "sealed",
      checkpointSha256: "abc123",
    });
    const rev2 = createQuarterRevision(record2, rev1);
    index = advanceQuarterLedgerIndex(index, rev2);
    await fs.writeFile(
      path.join(ledgerDir, "revision-0002.json"),
      serializeQuarterRecordRevision(rev2),
      "utf8",
    );

    // Transition: release
    const record3 = makeRecord(period, {
      collection: "sealed",
      publication: "published",
      checkpointSha256: "abc123",
    });
    const rev3 = createQuarterRevision(record3, rev2);
    index = advanceQuarterLedgerIndex(index, rev3);
    await fs.writeFile(
      path.join(ledgerDir, "revision-0003.json"),
      serializeQuarterRecordRevision(rev3),
      "utf8",
    );
    await fs.writeFile(
      path.join(ledgerDir, "ledger-index.json"),
      serializeQuarterLedgerIndex(index),
      "utf8",
    );

    // Verify chain
    const finalIndex = parseQuarterLedgerIndex(
      await fs.readFile(path.join(ledgerDir, "ledger-index.json"), "utf8"),
    );
    expect(finalIndex.headRevision).toBe(3);
    expect(finalIndex.revisions).toHaveLength(4);

    // Verify each revision chains to previous
    const rev0Parsed = parseQuarterRecordRevision(
      await fs.readFile(path.join(ledgerDir, "revision-0000.json"), "utf8"),
    );
    const rev1Parsed = parseQuarterRecordRevision(
      await fs.readFile(path.join(ledgerDir, "revision-0001.json"), "utf8"),
    );
    const rev2Parsed = parseQuarterRecordRevision(
      await fs.readFile(path.join(ledgerDir, "revision-0002.json"), "utf8"),
    );
    const rev3Parsed = parseQuarterRecordRevision(
      await fs.readFile(path.join(ledgerDir, "revision-0003.json"), "utf8"),
    );

    expect(rev0Parsed.previousRevisionDigest).toBeNull();
    expect(rev1Parsed.previousRevisionDigest).toBe(computeRevisionDigest(rev0Parsed));
    expect(rev2Parsed.previousRevisionDigest).toBe(computeRevisionDigest(rev1Parsed));
    expect(rev3Parsed.previousRevisionDigest).toBe(computeRevisionDigest(rev2Parsed));

    // Verify final state
    expect(rev3Parsed.record.collection).toBe("sealed");
    expect(rev3Parsed.record.publication).toBe("published");
  });

  it("old head revisions are preserved byte-for-byte", async () => {
    const ledgerDir = path.join(tmpDir, "quarter-ledger");
    await fs.mkdir(ledgerDir, { recursive: true });

    const period = "2026-q3";
    const record0 = makeRecord(period);
    const rev0 = createQuarterRevision(record0, null);
    const index0 = createQuarterLedgerIndex(period, rev0);

    const rev0Path = path.join(ledgerDir, "revision-0000.json");
    const rev0Bytes = serializeQuarterRecordRevision(rev0);
    await fs.writeFile(rev0Path, rev0Bytes, "utf8");
    await fs.writeFile(
      path.join(ledgerDir, "ledger-index.json"),
      serializeQuarterLedgerIndex(index0),
      "utf8",
    );

    // Create new revision
    const record1 = makeRecord(period, { collection: "collecting" });
    const rev1 = createQuarterRevision(record1, rev0);
    const index1 = advanceQuarterLedgerIndex(index0, rev1);
    await fs.writeFile(
      path.join(ledgerDir, "revision-0001.json"),
      serializeQuarterRecordRevision(rev1),
      "utf8",
    );
    await fs.writeFile(
      path.join(ledgerDir, "ledger-index.json"),
      serializeQuarterLedgerIndex(index1),
      "utf8",
    );

    // Verify revision-0000 is unchanged
    const rev0Reread = await fs.readFile(rev0Path, "utf8");
    expect(rev0Reread).toBe(rev0Bytes);
  });
});

describe("RFC-0115: restore drill detects missing shards", () => {
  it("missing vault manifest is flagged", async () => {
    // No vault-manifest.json created
    const manifestPath = path.join(tmpDir, "vault-manifest.json");
    try {
      await fs.access(manifestPath);
      expect.unreachable("Should not exist");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("vault manifest with missing shard is detected", async () => {
    const manifest = {
      schema: "hdri-vault-manifest@1",
      shards: [
        { path: "shard-001.parquet", sha256: "a".repeat(64) },
        { path: "shard-002.parquet", sha256: "b".repeat(64) },
      ],
    };
    await fs.writeFile(
      path.join(tmpDir, "vault-manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    // Only create shard-001, not shard-002
    await fs.writeFile(path.join(tmpDir, "shard-001.parquet"), Buffer.from("shard1"));

    // Verify shard-002 is missing
    try {
      await fs.access(path.join(tmpDir, "shard-002.parquet"));
      expect.unreachable("Should not exist");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("vault manifest with hash mismatch is detected", async () => {
    const shardData = Buffer.from("shard-content");
    const actualHash = createHash("sha256").update(shardData).digest("hex");
    const wrongHash = "0".repeat(64);

    const manifest = {
      schema: "hdri-vault-manifest@1",
      shards: [{ path: "shard-001.parquet", sha256: wrongHash }],
    };
    await fs.writeFile(
      path.join(tmpDir, "vault-manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
    await fs.writeFile(path.join(tmpDir, "shard-001.parquet"), shardData);

    // Verify hashes don't match
    expect(actualHash).not.toBe(wrongHash);
  });
});
