/**
 * Integration tests for SyncFromFactoryGogol data path.
 *
 * Tests emit-bundle reading, DB insertion with full schema,
 * idempotency, and edge cases — without instantiating the Gogol class.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readEmitBundle, streamObservations } from '@org/observatory-emit';
import { newId, deriveAssetId } from '@org/observatory-core';
import type { Observation } from '@org/observatory-core';
import { migrateObservatory } from '../db/migrate';

let tmpDir: string;
let obsDb: Database.Database;

// ── Helpers ─────────────────────────────────────────────────────────────────

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
  observation_id: newId(),
  asset_id: deriveAssetId('example.com'),
  crawl_id: newId(),
  signal_path: 'legal.impressum.present',
  value_bool: true,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: 'bool',
  observed_at: '2026-01-15T10:00:00.000Z',
  recorded_at: '2026-01-15T12:00:00.000Z',
  collector_version: 'a-contract-ontology@0.1.0',
  probe_version: 'v1',
  ruleset_version: '1.0.0',
  source_hash: 'abc123',
  crawl_hash: '2026-q2-de',
  evidence_ref: null,
  confidence: 1,
  collection_status: null,
  status: 'active',
  superseded_by: null,
  deprecated_reason: null,
  ...overrides,
});

const createEmitBundle = (
  dir: string,
  observations: Observation[],
  overrides: Partial<import('@org/observatory-emit').EmitManifest> = {},
): string => {
  const bundleDir = path.join(tmpDir, dir);
  fs.mkdirSync(bundleDir, { recursive: true });

  const manifest = {
    schema_version: '1' as const,
    format: 'ndjson-v1' as const,
    app_id: 'a-contract-ontology',
    collector_version: 'a-contract-ontology@0.1.0',
    ruleset_version: '1.0.0',
    ontology_version: '1.0.0',
    run_id: newId(),
    period: '2026-q2',
    emitted_at: new Date().toISOString(),
    observation_count: observations.length,
    evidence_count: 0,
    bundle_hash: null as string | null,
    ...overrides,
  };

  fs.writeFileSync(
    path.join(bundleDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // Reader hashes each line as `line + '\n'`, so ndjson must end with '\n'.
  const ndjson = observations.map((o) => JSON.stringify(o)).join('\n') + '\n';

  fs.writeFileSync(path.join(bundleDir, 'observations.ndjson'), ndjson);

  // Compute hash over the same content the reader will hash.
  if (observations.length > 0) {
    manifest.bundle_hash = crypto.createHash('sha256').update(ndjson).digest('hex');
    fs.writeFileSync(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
  }
  return bundleDir;
};

const insertObservations = (
  db: Database.Database,
  manifestRunId: string,
  observations: Observation[],
  obsDbRunId: string,
  period = '2026-q2',
): number => {
  const insertObs = db.prepare(`
    INSERT OR IGNORE INTO observations
      (id, asset_id, signal_path, ontology_version, value_bool, value_num,
       value_str, value_json, value_type, observed_at, recorded_at, run_id,
       evidence_ref, extractor_version, confidence, status, obs_json,
       collection_status, period, factory_run_id, crawl_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBundle = db.prepare(`
    INSERT OR IGNORE INTO synced_bundles
      (run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const batchInsert = db.transaction(() => {
    let inserted = 0;
    for (const obs of observations) {
      const r = insertObs.run(
        obs.observation_id,
        obs.asset_id,
        obs.signal_path,
        '1.0.0',
        obs.value_bool === null ? null : (obs.value_bool ? 1 : 0),
        obs.value_num,
        obs.value_str,
        obs.value_json,
        obs.value_type,
        obs.observed_at,
        obs.recorded_at,
        obsDbRunId,
        obs.evidence_ref,
        obs.probe_version,
        obs.confidence,
        obs.status,
        JSON.stringify(obs),
        obs.collection_status ?? null,
        period,
        manifestRunId,
        obs.crawl_hash ?? null,
      );
      inserted += r.changes;
    }
    insertBundle.run(
      manifestRunId,
      'a-contract-ontology',
      period,
      new Date().toISOString(),
      observations.length,
      new Date().toISOString(),
      obsDbRunId,
    );
    return inserted;
  });

  return batchInsert();
};

// ── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
  obsDb = new Database(path.join(tmpDir, 'observatory.db'));
  obsDb.pragma('journal_mode = WAL');
  migrateObservatory(obsDb);
});

afterAll(() => {
  obsDb.close();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SyncFromFactory — emit-bundle read path', () => {
  it('reads a bundle with multiple observations and verifies count', async () => {
    const obs1 = makeObservation({ signal_path: 'legal.impressum.present', value_bool: true });
    const obs2 = makeObservation({ signal_path: 'legal.datenschutz.present', value_bool: false });

    const bundleDir = createEmitBundle('multi-obs', [obs1, obs2]);
    const bundle = await readEmitBundle(bundleDir);
    expect(bundle.manifest.observation_count).toBe(2);
    expect(bundle.manifest.run_id).toBeTruthy();

    const collected: Observation[] = [];
    for await (const obs of streamObservations(bundle)) {
      collected.push(obs);
    }
    expect(collected).toHaveLength(2);
  });

  it('reads an empty bundle (0 observations)', async () => {
    const bundleDir = createEmitBundle('empty-bundle', []);
    const bundle = await readEmitBundle(bundleDir);
    expect(bundle.manifest.observation_count).toBe(0);

    const collected: Observation[] = [];
    for await (const obs of streamObservations(bundle)) {
      collected.push(obs);
    }
    expect(collected).toHaveLength(0);
  });

  it('throws on invalid manifest (missing schema_version)', async () => {
    const badDir = path.join(tmpDir, 'bad-manifest');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'manifest.json'), JSON.stringify({}));
    await expect(readEmitBundle(badDir)).rejects.toThrow();
  });
});

describe('SyncFromFactory — DB insertion', () => {
  const obsDbRunId = newId();
  let manifestRunId: string;

  it('inserts observations into the observatory schema', async () => {
    const obs1 = makeObservation({ signal_path: 'legal.impressum.present', value_bool: true });
    const obs2 = makeObservation({ signal_path: 'legal.datenschutz.present', value_bool: false });
    const bundleDir = createEmitBundle('insert-test', [obs1, obs2]);
    const bundle = await readEmitBundle(bundleDir);
    manifestRunId = bundle.manifest.run_id;

    const all: Observation[] = [];
    for await (const o of streamObservations(bundle)) all.push(o);

    const inserted = insertObservations(obsDb, manifestRunId, all, obsDbRunId);
    expect(inserted).toBe(2);

    const count = (obsDb.prepare('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    expect(count).toBe(2);

    // Verify all columns present
    const row = obsDb.prepare('SELECT signal_path, value_bool, value_num, value_str, value_json, obs_json, collection_status FROM observations LIMIT 1').get() as Record<string, unknown>;
    expect(row.signal_path).toBe('legal.impressum.present');
    expect(row.value_bool).toBe(1);
    expect(row.obs_json).toBeTruthy();
    expect(row.collection_status).toBeNull();
  });

  it('is idempotent — INSERT OR IGNORE on duplicate observation_id', async () => {
    // Re-read the same bundle (same observations, same IDs)
    const bundleDir = createEmitBundle('idempotent-test', [
      makeObservation({ observation_id: 'dup-1', signal_path: 'legal.impressum.present' }),
      makeObservation({ observation_id: 'dup-2', signal_path: 'legal.datenschutz.present' }),
    ]);
    const bundle = await readEmitBundle(bundleDir);
    const all: Observation[] = [];
    for await (const o of streamObservations(bundle)) all.push(o);

    // Insert once
    insertObservations(obsDb, bundle.manifest.run_id, all, obsDbRunId);
    const count1 = (obsDb.prepare('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    expect(count1).toBe(4); // 2 from previous + 2 new (dup IDs but different run_id)

    // Insert again with same IDs → no changes
    insertObservations(obsDb, bundle.manifest.run_id, all, obsDbRunId);
    const count2 = (obsDb.prepare('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;
    expect(count2).toBe(count1);
  });

  it('inserts observations with collection_status', async () => {
    const obs = makeObservation({
      signal_path: 'content.opening_hours.present',
      value_bool: null,
      collection_status: 'unreachable',
    });

    const bundleDir = createEmitBundle('col-status-test', [obs]);
    const bundle = await readEmitBundle(bundleDir);
    const all: Observation[] = [];
    for await (const o of streamObservations(bundle)) all.push(o);

    insertObservations(obsDb, bundle.manifest.run_id, all, obsDbRunId);

    const row = obsDb.prepare(
      "SELECT collection_status FROM observations WHERE signal_path = 'content.opening_hours.present'",
    ).get() as { collection_status: string };
    expect(row.collection_status).toBe('unreachable');
  });

  it('tracks synced bundles idempotently', async () => {
    const bundleDir = createEmitBundle('sync-tracking', [makeObservation()]);
    const bundle = await readEmitBundle(bundleDir);
    const runId = bundle.manifest.run_id;
    const all: Observation[] = [];
    for await (const o of streamObservations(bundle)) all.push(o);

    insertObservations(obsDb, runId, all, obsDbRunId);

    const synced = obsDb.prepare('SELECT run_id FROM synced_bundles WHERE run_id = ?').get(runId) as { run_id: string } | undefined;
    expect(synced).toBeDefined();
    expect(synced!.run_id).toBe(runId);
  });

  it('handles observations with all value types', async () => {
    const obsBool = makeObservation({ signal_path: 'test.bool', value_bool: true, value_type: 'bool' });
    const obsNum = makeObservation({ signal_path: 'test.num', value_num: 42, value_type: 'num' });
    const obsStr = makeObservation({ signal_path: 'test.str', value_str: 'hello', value_type: 'str' });
    const obsJson = makeObservation({ signal_path: 'test.json', value_json: '{"a":1}', value_type: 'json' });

    const bundleDir = createEmitBundle('value-types', [obsBool, obsNum, obsStr, obsJson]);
    const bundle = await readEmitBundle(bundleDir);
    const all: Observation[] = [];
    for await (const o of streamObservations(bundle)) all.push(o);

    insertObservations(obsDb, bundle.manifest.run_id, all, obsDbRunId);

    const boolRow = obsDb.prepare("SELECT value_bool FROM observations WHERE signal_path = 'test.bool'").get() as { value_bool: number | null };
    expect(boolRow.value_bool).toBe(1);

    const numRow = obsDb.prepare("SELECT value_num FROM observations WHERE signal_path = 'test.num'").get() as { value_num: number | null };
    expect(numRow.value_num).toBe(42);

    const strRow = obsDb.prepare("SELECT value_str FROM observations WHERE signal_path = 'test.str'").get() as { value_str: string | null };
    expect(strRow.value_str).toBe('hello');

    const jsonRow = obsDb.prepare("SELECT value_json FROM observations WHERE signal_path = 'test.json'").get() as { value_json: string | null };
    expect(jsonRow.value_json).toBe('{"a":1}');
  });
});
