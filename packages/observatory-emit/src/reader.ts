import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { AssetStateRecord, Observation } from '@org/observatory-core';
import type { EmitBundle, EmitManifest } from './types.js';

/** Reads and validates the manifest from an emit-bundle directory. */
export async function readEmitManifest(
  emitDir: string,
): Promise<EmitManifest> {
  const raw = await fsp.readFile(path.join(emitDir, 'manifest.json'), 'utf-8');
  const parsed = JSON.parse(raw) as EmitManifest;

  if (parsed.schema_version !== '1' && parsed.schema_version !== '2') {
    throw new Error(
      `Unsupported emit-bundle schema_version: ${parsed.schema_version}`,
    );
  }
  if (parsed.format !== 'ndjson-v1') {
    throw new Error(`Unsupported emit-bundle format: ${parsed.format}`);
  }

  return parsed;
}

/** Opens an emit-bundle for streaming read. */
export async function readEmitBundle(
  emitDir: string,
): Promise<EmitBundle> {
  const manifest = await readEmitManifest(emitDir);
  const dataDir = manifest.emit_dir ?? emitDir;
  return { manifest, emitDir: dataDir };
}

/**
 * Streams observations from a bundle one at a time.
 * Verifies the SHA-256 of the observations file against manifest.bundle_hash
 * after the stream is fully consumed.
 *
 * @throws if hash mismatch after full read.
 */
export async function* streamObservations(
  bundle: EmitBundle,
): AsyncGenerator<Observation> {
  const obsPath = path.join(bundle.emitDir, 'observations.ndjson');

  if (bundle.manifest.observation_count === 0) return;

  const fileStream = fs.createReadStream(obsPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const hash = crypto.createHash('sha256');
  let count = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    hash.update(line + '\n');
    yield JSON.parse(line) as Observation;
    count++;
  }

  if (bundle.manifest.bundle_hash !== null) {
    const actual = hash.digest('hex');
    if (actual !== bundle.manifest.bundle_hash) {
      throw new Error(
        `Emit-bundle integrity check failed for run_id=${bundle.manifest.run_id}: ` +
          `expected ${bundle.manifest.bundle_hash}, got ${actual}`,
      );
    }
  }

  if (count !== bundle.manifest.observation_count) {
    throw new Error(
      `Emit-bundle row count mismatch for run_id=${bundle.manifest.run_id}: ` +
        `manifest says ${bundle.manifest.observation_count}, read ${count}`,
    );
  }
}

/**
 * Streams asset state records from a bundle one at a time.
 * Verifies the SHA-256 against manifest.asset_states_hash after full read.
 *
 * Returns immediately if the bundle has no asset state file (v1 compat).
 *
 * @throws if hash mismatch after full read.
 */
export async function* streamAssetStates(
  bundle: EmitBundle,
): AsyncGenerator<AssetStateRecord> {
  const statePath = path.join(bundle.emitDir, 'asset-states.ndjson');

  const count = bundle.manifest.asset_state_count ?? 0;
  if (count === 0) return;

  let fileStream: fs.ReadStream | undefined;
  try {
    fileStream = fs.createReadStream(statePath, { encoding: 'utf-8' });
  } catch {
    // File missing but manifest claims non-zero count → throw
    throw new Error(
      `Missing asset-states.ndjson for run_id=${bundle.manifest.run_id}` +
        `(manifest says ${count} entries)`,
    );
  }

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const hash = crypto.createHash('sha256');
  let actualCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    hash.update(line + '\n');
    yield JSON.parse(line) as AssetStateRecord;
    actualCount++;
  }

  if (bundle.manifest.asset_states_hash != null) {
    const actual = hash.digest('hex');
    if (actual !== bundle.manifest.asset_states_hash) {
      throw new Error(
        `Asset-state integrity check failed for run_id=${bundle.manifest.run_id}: ` +
          `expected ${bundle.manifest.asset_states_hash}, got ${actual}`,
      );
    }
  }

  if (actualCount !== count) {
    throw new Error(
      `Asset-state row count mismatch for run_id=${bundle.manifest.run_id}: ` +
        `manifest says ${count}, read ${actualCount}`,
    );
  }
}
