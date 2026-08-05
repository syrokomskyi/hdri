/**
 * WP6: snapshot integrity (durability). Verifies that a manifest round-trips and
 * that verification detects both corruption (changed bytes/hash) and missing files.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashEntry, verifyManifest, type SnapshotManifest } from "../../tools/snapshot-core";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  fs.mkdirSync(path.join(dir, "db"), { recursive: true });
  fs.writeFileSync(path.join(dir, "db", "observatory_2026.db"), "fake-db-bytes");
  fs.writeFileSync(path.join(dir, "vault.parquet"), "fake-vault-bytes");
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function buildManifest(): Promise<SnapshotManifest> {
  return {
    kind: "observatory-canonical-snapshot",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    year: 2026,
    publishedRuns: [],
    files: [
      await hashEntry(dir, path.join("db", "observatory_2026.db")),
      await hashEntry(dir, "vault.parquet"),
    ],
  };
}

describe("snapshot-core", () => {
  it("verifies an intact snapshot", async () => {
    const m = await buildManifest();
    const r = await verifyManifest(dir, m);
    expect(r).toMatchObject({ ok: true, checked: 2, mismatches: [], missing: [] });
  });

  it("uses forward-slashed relative paths in the manifest (portable)", async () => {
    const m = await buildManifest();
    expect(m.files[0]!.path).toBe("db/observatory_2026.db");
  });

  it("detects a corrupted file (changed bytes)", async () => {
    const m = await buildManifest();
    fs.writeFileSync(path.join(dir, "vault.parquet"), "tampered-bytes!!!");
    const r = await verifyManifest(dir, m);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toContain("vault.parquet");
  });

  it("detects a missing file", async () => {
    const m = await buildManifest();
    fs.rmSync(path.join(dir, "vault.parquet"));
    const r = await verifyManifest(dir, m);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("vault.parquet");
  });

  it("rejects a manifest entry that escapes the sealed archive root", async () => {
    const m = await buildManifest();
    m.files.push({ path: "../outside", bytes: 0, sha256: "x" });
    expect((await verifyManifest(dir, m)).ok).toBe(false);
  });
});
