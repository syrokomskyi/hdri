/**
 * WP10: vault shard manifest — planned verification catches a MISSING shard.
 *
 * Uses plain files as stand-in shards (the manifest's integrity anchor is size+sha256,
 * independent of Parquet internals), fully isolated in a temp vault dir.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildShardEntry,
  emptyManifest,
  readManifest,
  upsertShardEntry,
  verifyVaultAgainstManifest,
  writeManifest,
  type VaultManifestData,
} from "../manifest.js";

let vaultDir: string;

beforeEach(() => {
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp10-manifest-"));
});

afterEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

/** Writes a fake shard at the canonical observations path and returns its absolute path. */
async function writeShard(
  year: number,
  runId: string,
  bytes: string,
  kind: "observations" | "asset_states" = "observations",
): Promise<string> {
  const dir = path.join(vaultDir, kind, `year=${year}`);
  await fsp.mkdir(dir, { recursive: true });
  const abs = path.join(dir, `${runId}.parquet`);
  await fsp.writeFile(abs, bytes, "utf-8");
  return abs;
}

async function recordShards(): Promise<VaultManifestData> {
  const manifest = emptyManifest();
  const a = await writeShard(2026, "run-a", "shard-a-contents");
  const b = await writeShard(2026, "run-b", "shard-b-contents");
  upsertShardEntry(
    manifest,
    await buildShardEntry(vaultDir, a, {
      kind: "observations",
      year: 2026,
      runId: "run-a",
      rows: 3,
    }),
  );
  upsertShardEntry(
    manifest,
    await buildShardEntry(vaultDir, b, {
      kind: "observations",
      year: 2026,
      runId: "run-b",
      rows: 5,
    }),
  );
  await writeManifest(vaultDir, manifest);
  return manifest;
}

describe("vault shard manifest (WP10)", () => {
  it("passes when every recorded shard is present and intact", async () => {
    const manifest = await recordShards();
    const result = await verifyVaultAgainstManifest(vaultDir, manifest);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.corrupted).toEqual([]);
    expect(result.untracked).toEqual([]);
  });

  it("catches a MISSING shard — the whole point: a vanished shard, not just a corrupted one", async () => {
    const manifest = await recordShards();
    await fsp.rm(path.join(vaultDir, "observations", "year=2026", "run-b.parquet"));

    const result = await verifyVaultAgainstManifest(vaultDir, manifest);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["observations/year=2026/run-b.parquet"]);
    expect(result.corrupted).toEqual([]);
  });

  it("catches a CORRUPTED shard via size/hash drift", async () => {
    const manifest = await recordShards();
    // Rewrite the shard with different contents (same path).
    await fsp.writeFile(
      path.join(vaultDir, "observations", "year=2026", "run-a.parquet"),
      "tampered-contents-of-different-length",
      "utf-8",
    );

    const result = await verifyVaultAgainstManifest(vaultDir, manifest);
    expect(result.ok).toBe(false);
    expect(result.corrupted).toEqual(["observations/year=2026/run-a.parquet"]);
    expect(result.missing).toEqual([]);
  });

  it("flags UNTRACKED shards; strict mode fails on them, default does not", async () => {
    const manifest = await recordShards();
    await writeShard(2026, "run-rogue", "not-recorded");

    const lenient = await verifyVaultAgainstManifest(vaultDir, manifest);
    expect(lenient.untracked).toEqual(["observations/year=2026/run-rogue.parquet"]);
    expect(lenient.ok).toBe(true); // present+intact recorded shards → ok despite untracked

    const strict = await verifyVaultAgainstManifest(vaultDir, manifest, { strict: true });
    expect(strict.ok).toBe(false);
  });

  it("upsert is idempotent by path and round-trips through disk", async () => {
    await recordShards();
    // Re-record run-a (immutable shard, re-hashed) — must not duplicate the entry.
    const reload = await readManifest(vaultDir);
    const a = path.join(vaultDir, "observations", "year=2026", "run-a.parquet");
    upsertShardEntry(
      reload,
      await buildShardEntry(vaultDir, a, {
        kind: "observations",
        year: 2026,
        runId: "run-a",
        rows: 3,
      }),
    );
    await writeManifest(vaultDir, reload);

    const final = await readManifest(vaultDir);
    expect(final.shards).toHaveLength(2);
    expect(final.shards.map((s) => s.path)).toEqual([
      "observations/year=2026/run-a.parquet",
      "observations/year=2026/run-b.parquet",
    ]);
  });

  it("readManifest returns an empty manifest when none exists yet", async () => {
    const manifest = await readManifest(vaultDir);
    expect(manifest.shards).toEqual([]);
    expect(manifest.kind).toBe("observatory-vault-manifest");
  });
});
