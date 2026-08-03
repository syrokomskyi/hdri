/*
<MODULE_CONTRACT>
<purpose>Exercises disk-backed conflict resolution, production signing, partition backpressure, interruption recovery and verified reading at quarterly scale.</purpose>
<non-goals><item>Does not retain rehearsal data or claim to test browser capture.</item></non-goals>
</MODULE_CONTRACT>
*/

import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateSigningKey, signObservation } from "@syrokomskyi/observatory-crypto";
import { EmitBundleWriter, readEmitBundle, streamObservations } from "@syrokomskyi/observatory-emit";
import type { Observation } from "@syrokomskyi/observatory-core";

const inputRows = Number(process.argv[2] ?? 5_000_000);
const artifactPath = process.argv[3];
if (!Number.isInteger(inputRows) || inputRows <= 0) throw new Error("rows must be a positive integer");
if (!artifactPath) throw new Error("artifact path is required");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-streaming-production-"));
const db = new Database(path.join(tempDir, "translation.sqlite"));
const emitDir = path.join(tempDir, "emit");
let peakRss = process.memoryUsage().rss;
let peakHeap = process.memoryUsage().heapUsed;
const sampleMemory = (): void => {
  const memory = process.memoryUsage();
  peakRss = Math.max(peakRss, memory.rss);
  peakHeap = Math.max(peakHeap, memory.heapUsed);
};
const telemetry = setInterval(sampleMemory, 1_000);
telemetry.unref();
const startedAt = new Date().toISOString();

try {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA temp_store=FILE;
    CREATE TABLE observations (
      seq INTEGER PRIMARY KEY,
      conflict_key TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);
  db.prepare(`
    WITH RECURSIVE generated(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM generated WHERE n < ?
    )
    INSERT INTO observations(seq, conflict_key, recorded_at, payload_json)
    SELECT n,
      'asset-' || CASE WHEN n % 20 = 0 THEN n - 1 ELSE n END || char(0) || 'legal.impressum.present',
      '2026-07-01T00:00:00.000Z',
      json_object(
        'observation_id', 'obs-' || n,
        'asset_id', 'da-' || CASE WHEN n % 20 = 0 THEN n - 1 ELSE n END,
        'crawl_id', 'crawl-2026-q3',
        'signal_path', 'legal.impressum.present',
        'value_bool', json('true'),
        'value_num', NULL,
        'value_str', NULL,
        'value_json', NULL,
        'value_type', 'bool',
        'observed_at', '2026-07-01T00:00:00.000Z',
        'recorded_at', '2026-07-01T00:00:00.000Z',
        'collector_version', 'rehearsal-translator@1',
        'probe_version', 'rule-v3',
        'ruleset_version', '1.0.0',
        'source_hash', printf('%064x', n),
        'crawl_hash', '0198f3a4-5b6c-7d8e-9f01-234567890abc',
        'evidence_ref', NULL,
        'confidence', 1,
        'status', 'active',
        'superseded_by', NULL,
        'deprecated_reason', NULL
      )
    FROM generated
  `).run(inputRows);

  db.exec(`
    CREATE INDEX observations_conflict_order ON observations(conflict_key, recorded_at DESC, seq DESC);
    CREATE TABLE resolved_observations AS
    SELECT ROW_NUMBER() OVER (ORDER BY conflict_key) AS output_seq, payload_json
    FROM (
      SELECT conflict_key, payload_json,
        ROW_NUMBER() OVER (PARTITION BY conflict_key ORDER BY recorded_at DESC, seq DESC) AS rank
      FROM observations
    ) WHERE rank = 1;
    CREATE UNIQUE INDEX resolved_output_seq ON resolved_observations(output_seq);
  `);
  const resolvedRows = (db.prepare("SELECT COUNT(*) AS n FROM resolved_observations").get() as { n: number }).n;
  const signing = generateSigningKey();
  const key = { ...signing, signingKeyId: "streaming-rehearsal", collectorId: "streaming-rehearsal" };
  const init = {
    app_id: "a-contract-ontology",
    collector_version: "a-contract-ontology@rehearsal",
    ruleset_version: "1.0.0",
    ontology_version: "1.0.0",
    run_id: "0198f3a4-5b6c-7d8e-9f01-234567890abc",
    period: "2026-q3",
  } as const;

  let writer = new EmitBundleWriter(emitDir, init, { partitionRows: 100_000 });
  await writer.open();
  const interruptionAfter = Math.min(resolvedRows, 250_000);
  for (const row of db.prepare("SELECT output_seq, payload_json FROM resolved_observations WHERE output_seq <= ? ORDER BY output_seq").iterate(interruptionAfter) as IterableIterator<{ output_seq: number; payload_json: string }>) {
    await writer.writeObservation(signObservation(JSON.parse(row.payload_json) as Observation, key));
  }
  const firstDrainWaits = writer.backpressureWaits;
  await writer.abort();

  writer = new EmitBundleWriter(emitDir, init, { partitionRows: 100_000 });
  await writer.open();
  const resumedRows = writer.committedObservationCount;
  for (const row of db.prepare("SELECT output_seq, payload_json FROM resolved_observations WHERE output_seq > ? ORDER BY output_seq").iterate(resumedRows) as IterableIterator<{ output_seq: number; payload_json: string }>) {
    await writer.writeObservation(signObservation(JSON.parse(row.payload_json) as Observation, key));
  }
  const manifest = await writer.commit();
  let verifiedRows = 0;
  for await (const _observation of streamObservations(await readEmitBundle(emitDir))) {
    verifiedRows++;
    if (verifiedRows % 100_000 === 0) sampleMemory();
  }
  sampleMemory();
  const heapLimitBytes = 2_147_483_648;
  const evidence = {
    schemaVersion: "2",
    productionPath: ["sqlite-disk-conflict-resolver", "signObservation", "EmitBundleWriter", "streamObservations"],
    startedAt,
    finishedAt: new Date().toISOString(),
    inputRows,
    resolvedRows,
    conflicts: inputRows - resolvedRows,
    signedRows: manifest.observation_count,
    verifiedRows,
    partitionRows: manifest.partition_rows,
    partitions: manifest.observation_partitions.length,
    resumedRows,
    backpressureWaits: firstDrainWaits + writer.backpressureWaits,
    peakRssBytes: peakRss,
    peakHeapBytes: peakHeap,
    heapLimitBytes,
    passed:
      inputRows >= 5_000_000 &&
      manifest.observation_count === resolvedRows &&
      verifiedRows === resolvedRows &&
      resumedRows >= 200_000 &&
      peakRss < heapLimitBytes,
  };
  await fs.mkdir(path.dirname(path.resolve(artifactPath)), { recursive: true });
  await fs.writeFile(path.resolve(artifactPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (!evidence.passed) process.exitCode = 1;
} finally {
  clearInterval(telemetry);
  db.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
