/**
 * WP15: frozen per-period methodology snapshots — the content-recoverability invariant.
 *
 * Proves the snapshot store (1) content-addresses codebook/ontology/frame and dedups a
 * byte-identical input shared across periods, (2) REFUSES to freeze content whose hash does not
 * match what run_methodology recorded (the mutated-.input guard), (3) keeps a period's snapshot
 * immutable (a different methodology_hash is rejected without force), and (4) verify detects a
 * corrupted or missing blob. Isolated in a temp store dir.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sha256 } from "@syrokomskyi/observatory-core";
import {
  freezeMethodologySnapshot,
  readMethodologyIndex,
  verifyMethodologyStore,
  type FreezeInputs,
} from "../../tools/methodology-snapshot-core";

let storeDir: string;

const CODEBOOK_A = "id: hdri\nversion: 1.0.0\n";
const ONTOLOGY_A = "version: 1.0.0\nsignals: {}\n";
const FRAME_A = '{"strataSystem":"destatis","source":"t","weights":{"DE-BW|III":1}}';

const inputs = (overrides: Partial<FreezeInputs> = {}): FreezeInputs => ({
  codebook: { source: CODEBOOK_A, version: "1.0.0", expectedSha256: sha256(CODEBOOK_A) },
  ontology: { source: ONTOLOGY_A, version: "1.0.0", expectedSha256: sha256(ONTOLOGY_A) },
  frame: { source: FRAME_A, version: null, expectedSha256: sha256(FRAME_A) },
  ...overrides,
});

beforeEach(() => {
  storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp15-meth-"));
});
afterEach(() => {
  fs.rmSync(storeDir, { recursive: true, force: true });
});

describe("WP15 methodology-snapshot-core — freeze", () => {
  it("content-addresses inputs and records a complete index entry", async () => {
    const res = await freezeMethodologySnapshot(storeDir, "2026-q2", "mh-1", inputs());
    expect(res.blobs.map((b) => b.role).sort()).toEqual(["codebook", "frame", "ontology"]);
    expect(res.written).toBe(3);

    const index = await readMethodologyIndex(storeDir);
    expect(index.entries).toHaveLength(1);
    const entry = index.entries[0]!;
    expect(entry.methodologyHash).toBe("mh-1");
    // Blob path IS the hash → content-addressed.
    const codebookBlob = entry.blobs.find((b) => b.role === "codebook")!;
    expect(codebookBlob.path).toBe(`blobs/${sha256(CODEBOOK_A)}.yaml`);
    expect(fs.existsSync(path.join(storeDir, codebookBlob.path))).toBe(true);
  });

  it("dedups a byte-identical input shared across two periods", async () => {
    await freezeMethodologySnapshot(storeDir, "2026-q2", "mh-1", inputs());
    // Same codebook + ontology, different frame → only the frame blob is new.
    const FRAME_B = '{"strataSystem":"destatis","source":"t","weights":{"DE-BY|III":2}}';
    const res = await freezeMethodologySnapshot(storeDir, "2026-q3", "mh-1", {
      ...inputs(),
      frame: { source: FRAME_B, version: null, expectedSha256: sha256(FRAME_B) },
    });
    expect(res.written).toBe(1); // codebook + ontology already stored
    const blobDir = path.join(storeDir, "blobs");
    // 3 unique blobs total: codebook, ontology, 2 frames = 4. (both frames distinct)
    expect(fs.readdirSync(blobDir)).toHaveLength(4);
  });

  it("REFUSES content whose hash does not match run_methodology", async () => {
    await expect(
      freezeMethodologySnapshot(storeDir, "2026-q2", "mh-1", {
        ...inputs(),
        codebook: {
          source: "id: hdri\nversion: 9.9.9\n",
          version: "1.0.0",
          expectedSha256: sha256(CODEBOOK_A),
        },
      }),
    ).rejects.toThrow(/codebook content sha256/);
    // Nothing partial should be indexed.
    const index = await readMethodologyIndex(storeDir);
    expect(index.entries).toHaveLength(0);
  });

  it("is idempotent for the same period+methodology and immutable for a different one", async () => {
    await freezeMethodologySnapshot(storeDir, "2026-q2", "mh-1", inputs());
    const again = await freezeMethodologySnapshot(storeDir, "2026-q2", "mh-1", inputs());
    expect(again.alreadyFrozen).toBe(true);
    expect(again.written).toBe(0);

    await expect(
      freezeMethodologySnapshot(storeDir, "2026-q2", "mh-DIFFERENT", inputs()),
    ).rejects.toThrow(/already frozen with methodology/);

    // force overrides.
    const forced = await freezeMethodologySnapshot(storeDir, "2026-q2", "mh-DIFFERENT", inputs(), {
      force: true,
    });
    expect(forced.period).toBe("2026-q2");
    const index = await readMethodologyIndex(storeDir);
    expect(index.entries[0]!.methodologyHash).toBe("mh-DIFFERENT");
  });

  it("accepts retroactive freeze with no expected hash", async () => {
    const res = await freezeMethodologySnapshot(storeDir, "2025-q4", "mh-legacy", {
      codebook: { source: CODEBOOK_A, version: "0.9.0", expectedSha256: null },
    });
    expect(res.blobs).toHaveLength(1);
  });
});

describe("WP15 methodology-snapshot-core — verify", () => {
  it("PASSES a clean store and detects corruption + missing blobs", async () => {
    await freezeMethodologySnapshot(storeDir, "2026-q2", "mh-1", inputs());
    expect((await verifyMethodologyStore(storeDir)).ok).toBe(true);

    // Corrupt the codebook blob in place → its content no longer hashes to its path.
    const index = await readMethodologyIndex(storeDir);
    const codebookBlob = index.entries[0]!.blobs.find((b) => b.role === "codebook")!;
    await fsp.writeFile(path.join(storeDir, codebookBlob.path), "tampered", "utf-8");
    let res = await verifyMethodologyStore(storeDir);
    expect(res.ok).toBe(false);
    expect(res.corrupted).toContain(codebookBlob.path);

    // Delete a blob → MISSING.
    const frameBlob = index.entries[0]!.blobs.find((b) => b.role === "frame")!;
    fs.rmSync(path.join(storeDir, frameBlob.path));
    res = await verifyMethodologyStore(storeDir);
    expect(res.missing).toContain(frameBlob.path);
  });
});
