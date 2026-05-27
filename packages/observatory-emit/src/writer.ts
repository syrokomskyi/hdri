import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AssetStateRecord, Observation } from '@org/observatory-core';
import type { EmitManifest, FileTracker } from './types.js';

type WriterInit = Omit<
  EmitManifest,
  'schema_version' | 'format' | 'emitted_at'
  | 'observation_count' | 'evidence_count' | 'bundle_hash'
  | 'asset_state_count' | 'asset_states_hash'
>;

/**
 * Streams observations and asset states to an emit-bundle directory.
 *
 * Usage:
 *   const w = new EmitBundleWriter('/path/to/.output/emit', init);
 *   await w.open();
 *   for (const obs of observations) w.writeObservation(obs);
 *   for (const st of assetStates) w.writeAssetState(st);
 *   const manifest = await w.commit();
 */
export class EmitBundleWriter {
  private readonly emitDir: string;
  private readonly init: WriterInit;

  private obs!: FileTracker;
  private assetStates!: FileTracker;
  private opened = false;
  private committed = false;

  constructor(emitDir: string, init: WriterInit) {
    this.emitDir = emitDir;
    this.init = init;
  }

  /** Creates emit/ and evidence/ directories, opens both NDJSON streams. */
  async open(): Promise<void> {
    if (this.opened) throw new Error('EmitBundleWriter already opened');

    await fsp.mkdir(path.join(this.emitDir, 'evidence'), { recursive: true });

    this.obs = this.createTracker('observations.ndjson');
    this.assetStates = this.createTracker('asset-states.ndjson');
    this.opened = true;
  }

  /** Serialises one observation and appends it to the NDJSON stream. */
  writeObservation(obs: Observation): void {
    if (!this.opened) throw new Error('Call open() first');
    if (this.committed) throw new Error('Already committed');

    const line = JSON.stringify(obs) + '\n';
    this.obs.stream.write(line);
    this.obs.hash.update(line);
    this.obs.count++;
  }

  /** Serialises one asset state record and appends it to the NDJSON stream. */
  writeAssetState(state: AssetStateRecord): void {
    if (!this.opened) throw new Error('Call open() first');
    if (this.committed) throw new Error('Already committed');

    const line = JSON.stringify(state) + '\n';
    this.assetStates.stream.write(line);
    this.assetStates.hash.update(line);
    this.assetStates.count++;
  }

  /** Absolute path to the evidence/ subdirectory for this bundle. */
  get evidenceDir(): string {
    return path.join(this.emitDir, 'evidence');
  }

  /**
   * Closes all streams, computes hashes, and writes manifest.json.
   * Returns the finalised manifest.
   */
  async commit(): Promise<EmitManifest> {
    if (!this.opened) throw new Error('Call open() first');
    if (this.committed) throw new Error('Already committed');
    this.committed = true;

    await this.finaliseTracker(this.obs);
    await this.finaliseTracker(this.assetStates);

    const bundleHash = this.obs.count > 0 ? this.obs.hash.digest('hex') : null;
    const assetStatesHash = this.assetStates.count > 0
      ? this.assetStates.hash.digest('hex')
      : null;
    const evidenceCount = await countEvidenceFiles(
      path.join(this.emitDir, 'evidence'),
    );

    const manifest: EmitManifest = {
      schema_version: '2',
      format: 'ndjson-v1',
      ...this.init,
      emitted_at: new Date().toISOString(),
      observation_count: this.obs.count,
      evidence_count: evidenceCount,
      bundle_hash: bundleHash,
      asset_state_count: this.assetStates.count,
      asset_states_hash: assetStatesHash,
    };

    await fsp.writeFile(
      path.join(this.emitDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );

    return manifest;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private createTracker(filename: string): FileTracker {
    const stream = fs.createWriteStream(path.join(this.emitDir, filename), {
      encoding: 'utf-8',
    });
    return { stream, hash: crypto.createHash('sha256'), count: 0 };
  }

  private finaliseTracker(t: FileTracker): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      t.stream.end((err: Error | null | undefined) =>
        err ? reject(err) : resolve(),
      );
    });
  }
}

async function countEvidenceFiles(evidenceDir: string): Promise<number> {
  try {
    const entries = await fsp.readdir(evidenceDir);
    return entries.length;
  } catch {
    return 0;
  }
}
