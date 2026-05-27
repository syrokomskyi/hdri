/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 3-extract-profile signatures before consuming pages.db files.</purpose>
<keywords>verify, upstream, signature, ed25519, pages.db, transparency</keywords>
<responsibilities>
  <item>Loads public keys from transparency/keys/ directory.</item>
  <item>Discovers upstream pages.db files and their source-signature.json manifests.</item>
  <item>Verifies ed25519 signatures against the corresponding public keys.</item>
  <item>Re-computes SHA-256 of each pages.db and compares it to the signed content hash.</item>
  <item>Writes verification summary JSON and Markdown artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not modify upstream pages.db files.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="VerifyUpstreamGogol">Verifies upstream source signatures for traceability.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
</CHANGE_SUMMARY>
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
import { toFactoryRelativePath, upstreamProfileOutputRoot } from '../config.js';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';

const APP_VERSION = '0.1.0';

export class VerifyUpstreamGogol extends Gogol {
  override readonly id = 'verify-upstream';

  override readonly guide = {
    title: 'Verify upstream signatures',
    purpose: 'Check ed25519 signatures on every upstream 3-extract-profile pages.db before ingestion.',
    decisionType: 'auto' as const,
    inputs: [
      '3-extract-profile/.output/<deviceId>/data/db/pages-YYYY-h*.db',
      '3-extract-profile/.output/<deviceId>/*-sign-source/source-signature.json',
      '<repo-root>/transparency/keys/*.pem',
    ],
    outputs: ['verify-upstream-summary.json', 'verify-upstream-summary.md'],
    definitionOfDone: [
      'All discovered pages.db files have a matching verified signature',
      'Content hash in each manifest matches the re-computed SHA-256 of pages.db',
      'Verification summary written',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const { year } = state.brief;
    // pages.db name pattern: pages-YYYY-h1.db or pages-YYYY-h2.db
    const pagesDbNamePatterns = [`pages-${year}-h1.db`, `pages-${year}-h2.db`];

    const transparencyDir = getTransparencyKeysDir();
    const keyMap = await loadVerificationKeys(transparencyDir);
    console.log(`[verify-upstream] Loaded ${keyMap.size} verification key(s) from ${transparencyDir}`);

    const devices = await listDeviceFolders(upstreamProfileOutputRoot);
    const entries: VerificationEntry[] = [];
    let allOk = true;

    for (const dev of devices) {
      for (const pagesDbName of pagesDbNamePatterns) {
        const dbPath = path.join(dev.path, 'data', 'db', pagesDbName);
        if (!fs.existsSync(dbPath)) {
          continue;
        }

        // Search for source-signature.json under the device output tree
        const manifestPath = await findManifestPath(dev.path, { expectedAppId: '3-extract-profile' });
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

        // Re-compute SHA-256 of pages.db and compare
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
    }

    const outputDir = ctx.getGogolOutputDir(this.id);
    await ensureOutputDir(outputDir);

    const reporter = new VerificationReporter(outputDir, toFactoryRelativePath);
    await reporter.writeSummary({
      appId: '4-audit-lighthouse',
      appVersion: APP_VERSION,
      deviceId: state.brief.deviceId,
      sourceToken: state.brief.sourceToken,
      year,
      upstreamRoot: upstreamProfileOutputRoot,
      transparencyDir,
      allOk,
      entries,
      completedAt: new Date().toISOString(),
    });
    await reporter.writeSummaryMd({
      appId: '4-audit-lighthouse',
      appVersion: APP_VERSION,
      deviceId: state.brief.deviceId,
      sourceToken: state.brief.sourceToken,
      year,
      upstreamRoot: upstreamProfileOutputRoot,
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
