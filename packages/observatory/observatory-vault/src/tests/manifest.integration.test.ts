/**
 * WP10: manifest recording over a REAL DuckDB-written Parquet shard.
 *
 * The pure manifest.test.ts uses plain files; this proves buildShardEntry +
 * verifyVaultAgainstManifest work against an actual ZSTD Parquet shard produced by
 * VaultWriter (the production write path in WriteVaultGogol), and that corrupting the
 * real shard is caught.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SignedObservation } from "@syrokomskyi/observatory-crypto";
import { VaultWriter } from "../writer.js";
import { obsShardPath } from "../paths.js";
import { readManifest, verifyVaultAgainstManifest } from "../manifest.js";

let vaultDir: string;
const YEAR = 2026;
const RUN = "factory-run-1";

const signedObs = (id: string): SignedObservation =>
  ({
    observation_id: id,
    asset_id: "da-abc",
    crawl_id: RUN,
    signal_path: "legal.impressum.present",
    value_bool: true,
    value_num: null,
    value_str: null,
    value_json: null,
    value_type: "bool",
    observed_at: "2026-07-01T00:00:00.000Z",
    recorded_at: "2026-07-01T01:00:00.000Z",
    collector_version: "test@0.0.0",
    probe_version: "rule_v3",
    ruleset_version: "1.0.0",
    source_hash: "h",
    crawl_hash: "2026-q3",
    evidence_ref: null,
    confidence: 1,
    collection_status: null,
    status: "active",
    superseded_by: null,
    deprecated_reason: null,
    signature: "sig",
    signed_at: "2026-07-01T02:00:00.000Z",
    signing_key_id: "dev-abc",
    collector_id: "dev",
  }) as unknown as SignedObservation;

beforeEach(() => {
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp10-real-"));
});

afterEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

describe("vault manifest over a real Parquet shard (WP10)", () => {
  it("records and verifies a real ZSTD shard, and catches corruption of it", async () => {
    const writer = new VaultWriter(vaultDir);
    const res = await writer.writeShard(
      "observations",
      [signedObs("o1"), signedObs("o2")] as readonly object[],
      {
        year: YEAR,
        runId: RUN,
      },
    );
    expect(res.count).toBe(2);

    // writeShard records the manifest atomically; read it back for verification.
    const manifest = await readManifest(vaultDir);

    // Intact → PASS.
    const okResult = await verifyVaultAgainstManifest(vaultDir, manifest);
    expect(okResult.ok).toBe(true);
    expect(okResult.untracked).toEqual([]); // the real shard is tracked

    // Corrupt the real Parquet bytes → CORRUPTED. The shard is written read-only
    // (accidental-edit guard), so a determined tamperer / bit-rot must first restore
    // write permission — exactly what we simulate here. The sha256 manifest still
    // catches the change, which is the point: read-only stops the *accident*, the hash
    // stops the *tamper*.
    await fsp.chmod(obsShardPath(vaultDir, YEAR, RUN), 0o644);
    await fsp.appendFile(obsShardPath(vaultDir, YEAR, RUN), "junk");
    const badResult = await verifyVaultAgainstManifest(vaultDir, manifest);
    expect(badResult.ok).toBe(false);
    expect(badResult.corrupted).toEqual([`observations/year=${YEAR}/${RUN}.parquet`]);
  });

  it("writes shards read-only and refuses to overwrite them (immutability guard)", async () => {
    const writer = new VaultWriter(vaultDir);
    const res = await writer.writeShard("observations", [signedObs("o1")] as readonly object[], {
      year: YEAR,
      runId: RUN,
    });

    // Written read-only: a stray append fails at the filesystem, not silently.
    const mode = fs.statSync(res.shardPath).mode & 0o200;
    expect(mode).toBe(0); // owner-write bit cleared

    // Re-writing the same shard is refused outright — shards are append-only.
    await expect(
      writer.writeShard("observations", [signedObs("o2")] as readonly object[], {
        year: YEAR,
        runId: RUN,
      }),
    ).rejects.toThrow(/Refusing to overwrite/);
  });
});
