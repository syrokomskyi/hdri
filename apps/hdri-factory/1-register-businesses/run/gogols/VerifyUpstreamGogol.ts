/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 0-harvest-source signatures before consuming core.db files.</purpose>
<keywords>verify, upstream, signature, ed25519, core.db, transparency</keywords>
<responsibilities>
  <item>Loads public keys from transparency/keys/ directory.</item>
  <item>Discovers upstream core.db files and their source-signature.json manifests.</item>
  <item>Verifies ed25519 signatures against the corresponding public keys.</item>
  <item>Re-computes SHA-256 of each core.db and compares it to the signed content hash.</item>
  <item>Writes verification summary JSON and Markdown artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not modify upstream core.db files.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="VerifyUpstreamGogol">Verifies upstream source signatures for traceability.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>findManifestPath now filters by manifest.app_id instead of directory name suffix for robustness.</item>
  <item>Load verification keys from repo-root transparency/keys/ via getTransparencyKeysDir() from @org/observatory-crypto.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
  <item>Rcand dMa@ogervaV-rtfi>o_SRotandfdMnifPh@r/boy-mi
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  getTransparencyKeysDir,
  listDeviceFolders,
  loadVerificationKeys,
  verifyUpstreamManifest,
  type SourceSignatureManifest,
} from '@org/observatory-crypto';
import { hashDatabaseFile } from '@org/business-core/cross-db';
import { VerificationReporter, findManifestPath, type VerificationEntry } from '@org/observatory-emit';
import { toFactoryRelativePath } from '../config.js';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';

const APP_VERSION = '0.1.0';

export class VerifyUpstreamGogol extends Gogol {
  override readonly id = 'verify-upstream';

  override readonly guide = {
    title: 'Verify upstream signatures',
    purpose: 'Check ed25519 signatures on every upstream 0-harvest-source core.db before ingestion.',
    decisionType: 'auto' as const,
    inputs: [
      '0-harvest-source/.output/<deviceId>/data/db/core_YYYY.db',
      '0-harvest-source/.output/<deviceId>/*-sign-source/source-signature.json',
      '<repo-root>/transparency/keys/*.pem',
    ],
    outputs: ['verify-upstream-summary.json', 'verify-upstream-summary.md'],
    definitionOfDone: [
      'All discovered core.db files have a matching verified signature',
      'Content hash in each manifest matches the re-computed SHA-256 of core.db',
      'Verification summary written',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const year = state.year;
    const coreDbName = `core_${year}.db`;

    const transparencyDir = getTransparencyKeysDir();
    const keyMap = await loadVerificationKeys(transparencyDir);
    console.log(`[verify-upstream] Loaded ${keyMap.size} verification key(s) from ${transparencyDir}`);

    const { upstreamHarvestOutputRoot } = state;
    const devices = await listDeviceFolders(upstreamHarvestOutputRoot);
    const entries: VerificationEntry[] = [];
    let allOk = true;

    for (const dev of devices) {
      const dbPath = path.join(dev.path, 'data', 'db', coreDbName);
      if (!fs.existsSync(dbPath)) {
        continue;
      }

      // Search for source-signature.json under the device output tree
      const manifestPath = await findManifestPath(dev.path, { expectedAppId: '0-harvest-source' });
      if (!manifestPath) {
        allOk = false;
        entries.push({
          deviceId: dev.deviceId,
          dbPath,
          manifestPath: '',
          ok: false,
          reason: 'Missing source-signature.json',
          contentHash: '',
        });
        continue;
      }

      const manifest: SourceSignatureManifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
      const verifyResult = verifyUpstreamManifest(manifest, keyMap);

      if (!verifyResult.ok) {
        allOk = false;
        entries.push({
          deviceId: dev.deviceId,
          dbPath,
          manifestPath,
          ok: false,
          reason: verifyResult.reason,
          contentHash: manifest.content_hash,
        });
        continue;
      }

      // Re-compute SHA-256 of core.db and compare
      const computedHash = await hashDatabaseFile(dbPath);
      if (computedHash !== manifest.content_hash) {
        allOk = false;
        entries.push({
          deviceId: dev.deviceId,
          dbPath,
          manifestPath,
          ok: false,
          reason: `Hash mismatch: manifest=${manifest.content_hash} computed=${computedHash}`,
          contentHash: manifest.content_hash,
          computedHash,
        });
        continue;
      }

      entries.push({
        deviceId: dev.deviceId,
        dbPath,
        manifestPath,
        ok: true,
        contentHash: manifest.content_hash,
        computedHash,
      });
    }

    const outputDir = ctx.getGogolOutputDir(this.id);
    await ensureOutputDir(outputDir);

    const reporter = new VerificationReporter(outputDir, toFactoryRelativePath);
    await reporter.writeSummary({
      appId: '1-register-businesses',
      appVersion: APP_VERSION,
      deviceId: state.deviceId,
      sourceToken: state.sourceToken,
      year,
      upstreamRoot: state.upstreamHarvestOutputRoot,
      transparencyDir,
      allOk,
      entries,
      completedAt: new Date().toISOString(),
    });
    await reporter.writeSummaryMd({
      appId: '1-register-businesses',
      appVersion: APP_VERSION,
      deviceId: state.deviceId,
      sourceToken: state.sourceToken,
      year,
      upstreamRoot: state.upstreamHarvestOutputRoot,
      transparencyDir,
      allOk,
      entries,
      completedAt: new Date().toISOString(),
    });

    if (!allOk) {
      const failed = entries.filter((e) => !e.ok);
      throw new Error(
        `Upstream verification failed for ${failed.length} device(s): ` +
        failed.map((f) => `${f.deviceId} (${f.reason})`).join('; '),
      );
    }

    console.log(`[verify-upstream] All ${entries.length} upstream signature(s) verified.`);
  }
}
