/**
 * Contract tests for the emit-bundle — the formal factory↔observatory handoff.
 *
 * This boundary had no tests, yet every factory app writes through it and the
 * observatory reads through it. The invariants that must hold:
 *   1. round-trip: what the writer commits, the reader streams back identically;
 *   2. integrity: a tampered data file or a miscounted manifest is rejected on read;
 *   3. contract: the manifest schema is enforced at the boundary, and the frozen
 *      golden manifest still validates (so the wire format cannot silently drift).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import { EmitBundleWriter } from "../writer.js";
import { readEmitBundle, streamAssetStates, streamEvidence, streamObservations } from "../reader.js";
import { EmitManifestSchema, parseEmitManifest } from "../schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let emitDir: string;

const INIT = {
  app_id: "3-extract-profile",
  collector_version: "3-extract-profile@1.4.0",
  ruleset_version: "1.3.0",
  ontology_version: "1.1.0",
  run_id: "0192f3a4-5b6c-7d8e-9f01-234567890abc",
  period: "2026-q2",
} as const;

const obs = (id: string): Observation => ({
  observation_id: id,
  asset_id: "da-abc",
  crawl_id: "crawl-1",
  signal_path: "legal.impressum.present",
  value_bool: true,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: "bool",
  observed_at: "2026-05-01T00:00:00.000Z",
  recorded_at: "2026-05-01T01:00:00.000Z",
  collector_version: "3-extract-profile@1.4.0",
  probe_version: "rule_v3",
  ruleset_version: "1.3.0",
  source_hash: "h",
  crawl_hash: "2026-q2",
  evidence_ref: null,
  confidence: 1,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
});

const state = (id: string): AssetStateRecord => ({
  asset_id: id,
  domain: "example.de",
  gewerk_group: "elektro",
  hwo_uid: null,
  hwo_provenance: null,
  bundesland: "DE-BW",
  gemeinde: null,
  mappings: [],
});

beforeEach(() => {
  emitDir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-"));
});

afterEach(() => {
  fs.rmSync(emitDir, { recursive: true, force: true });
});

async function writeBundle(observations: Observation[], states: AssetStateRecord[]): Promise<void> {
  const w = new EmitBundleWriter(emitDir, INIT);
  await w.open();
  for (const o of observations) await w.writeObservation(o);
  for (const s of states) await w.writeAssetState(s);
  await w.commit();
}

describe("emit-bundle round-trip", () => {
  it("streams back exactly what was written, and the manifest counts/hashes match", async () => {
    await writeBundle([obs("o1"), obs("o2")], [state("da-abc")]);

    const bundle = await readEmitBundle(emitDir);
    expect(bundle.manifest.observation_count).toBe(2);
    expect(bundle.manifest.asset_state_count).toBe(1);
    expect(bundle.manifest.bundle_hash).toMatch(/^[0-9a-f]{64}$/);

    const readObs: Observation[] = [];
    for await (const o of streamObservations(bundle)) readObs.push(o);
    expect(readObs.map((o) => o.observation_id)).toEqual(["o1", "o2"]);

    const readStates: AssetStateRecord[] = [];
    for await (const s of streamAssetStates(bundle)) readStates.push(s);
    expect(readStates.map((s) => s.asset_id)).toEqual(["da-abc"]);
  });

  it("an empty bundle has a null bundle_hash and yields nothing", async () => {
    await writeBundle([], []);
    const bundle = await readEmitBundle(emitDir);
    expect(bundle.manifest.observation_count).toBe(0);
    expect(bundle.manifest.bundle_hash).toBeNull();

    const read: Observation[] = [];
    for await (const o of streamObservations(bundle)) read.push(o);
    expect(read).toEqual([]);
  });

  it("streams conflict evidence through the same hash-verified partition contract", async () => {
    const writer = new EmitBundleWriter(emitDir, INIT, { partitionRows: 1_000 });
    await writer.open();
    await writer.writeEvidence({ evidenceType: "observation-conflict", loserObservationId: "o-1" });
    const manifest = await writer.commit();
    expect(manifest.evidence_count).toBe(1);
    expect(manifest.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    const records: unknown[] = [];
    for await (const record of streamEvidence(await readEmitBundle(emitDir))) records.push(record);
    expect(records).toEqual([{ evidenceType: "observation-conflict", loserObservationId: "o-1" }]);
  });

  it("resumes after interruption from the last sealed partition without duplicates", async () => {
    const observations = Array.from({ length: 1_200 }, (_, index) => obs(`o-${index}`));
    const interrupted = new EmitBundleWriter(emitDir, INIT, { partitionRows: 1_000 });
    await interrupted.open();
    for (const item of observations.slice(0, 1_100)) await interrupted.writeObservation(item);
    await interrupted.abort();
    const staleTemp = path.join(emitDir, "observations", "part-000001.ndjson.stale.tmp");
    await fsp.writeFile(staleTemp, "partial\n");

    const resumed = new EmitBundleWriter(emitDir, INIT, { partitionRows: 1_000 });
    await resumed.open();
    await expect(fsp.access(staleTemp)).rejects.toMatchObject({ code: "ENOENT" });
    expect(resumed.committedObservationCount).toBe(1_000);
    for (const item of observations.slice(resumed.committedObservationCount)) {
      await resumed.writeObservation(item);
    }
    await resumed.commit();

    const ids: string[] = [];
    for await (const item of streamObservations(await readEmitBundle(emitDir))) ids.push(item.observation_id);
    expect(ids).toEqual(observations.map((item) => item.observation_id));
  });
});

describe("emit-bundle integrity enforcement", () => {
  it("rejects a tampered observations file (hash mismatch)", async () => {
    await writeBundle([obs("o1")], []);
    await fsp.appendFile(
      path.join(emitDir, "observations", "part-000000.ndjson"),
      JSON.stringify(obs("evil")) + "\n",
    );

    const bundle = await readEmitBundle(emitDir);
    await expect(async () => {
      for await (const _ of streamObservations(bundle)) {
        void _;
      }
    }).rejects.toThrow(/integrity check failed|row count mismatch/);
  });
});

describe("emit-bundle manifest contract (zod)", () => {
  it("accepts the frozen golden manifest — the wire format has not drifted", async () => {
    const raw = JSON.parse(
      await fsp.readFile(path.join(__dirname, "__fixtures__", "golden-manifest.json"), "utf-8"),
    ) as unknown;
    expect(() => parseEmitManifest(raw)).not.toThrow();
  });

  it("rejects an unknown schema_version", () => {
    const raw = { ...validManifest(), schema_version: "99" };
    expect(EmitManifestSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects a manifest whose hash/count invariant is broken", () => {
    // observation_count > 0 but bundle_hash null → must fail.
    const raw = { ...validManifest(), observation_count: 3, bundle_hash: null };
    expect(EmitManifestSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects a mistyped count", () => {
    const raw = { ...validManifest(), observation_count: "2" };
    expect(EmitManifestSchema.safeParse(raw).success).toBe(false);
  });

  it("the reader surfaces a malformed manifest as a descriptive error", async () => {
    await fsp.writeFile(
      path.join(emitDir, "manifest.json"),
      JSON.stringify({ format: "ndjson-partitioned-v1" }),
    );
    await expect(readEmitBundle(emitDir)).rejects.toThrow(/Invalid emit-bundle manifest/);
  });
});

function validManifest() {
  return {
    schema_version: "3",
    format: "ndjson-partitioned-v1",
    app_id: "3-extract-profile",
    collector_version: "c@1.0.0",
    ruleset_version: "1.0.0",
    ontology_version: "1.0.0",
    run_id: "r1",
    period: "2026-q2",
    emitted_at: "2026-05-01T12:00:00.000Z",
    observation_count: 0,
    partition_rows: 100_000,
    observation_partitions: [],
    evidence_count: 0,
    evidence_partitions: [],
    evidence_hash: null,
    bundle_hash: null,
    asset_state_count: 0,
    asset_state_partitions: [],
    asset_states_hash: null,
  };
}
