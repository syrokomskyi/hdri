/*
<MODULE_CONTRACT>
<purpose>Signs the pages.db file hash with the device signing key.</purpose>
<keywords>sign, signature, ed25519, content-hash, traceability, pages.db</keywords>
<responsibilities>
  <item>Computes SHA-256 hash of the final pages.db file.</item>
  <item>Creates ed25519 signature manifest with source metadata.</item>
  <item>Writes source-signature.json manifest.</item>
  <item>Writes sign-source-summary.json and sign-source-summary.md.</item>
</responsibilities>
<non-goals>
  <item>Do not modify pages.db after signing.</item>
  <item>Do not classify or parse source data.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SignSourceGogol">Signs pages.db file hash for downstream verification.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { hashDatabaseFile } from '@org/business-core/cross-db';
import { loadSigningKeyFromEnv, signSource } from '@org/observatory-crypto';
import { SignSourceReporter } from '@org/observatory-emit';
import { toFactoryRelativePath } from '../config.js';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { getPagesDbPath } from '../paths.js';

const APP_VERSION = '0.1.0';

export class SignSourceGogol extends Gogol {
  override readonly id = 'sign-source';

  override readonly guide = {
    title: 'Sign source',
    purpose: 'Create cryptographic signature over pages.db file hash for downstream verification and traceability.',
    decisionType: 'auto' as const,
    inputs: ['pages.db (final, fully populated)'],
    outputs: [
      'source-signature.json (ed25519 signature manifest)',
      'sign-source-summary.json',
      'sign-source-summary.md',
    ],
    definitionOfDone: [
      'SHA-256 of pages.db computed',
      'ed25519 signature created with device signing key',
      'Signature manifest written with key ID and timestamp',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    // Extract year and half from pagesDbName (format: pages-YYYY-h1 or pages-YYYY-h2)
    const match = state.pagesDbName.match(/pages-(\d{4})-h([12])/);
    if (!match) {
      throw new Error(`Invalid pagesDbName format: ${state.pagesDbName}`);
    }
    const year = parseInt(match[1], 10);
    const half = parseInt(match[2], 10) as 1 | 2;
    const pagesDbPath = getPagesDbPath(year, half);

    const signingKey = loadSigningKeyFromEnv();

    const contentHash = await hashDatabaseFile(pagesDbPath);
    const manifest = signSource({
      signingKey,
      sourceToken: state.brief.sourceToken,
      appId: '3-extract-profile',
      appVersion: APP_VERSION,
      contentHash,
      rowsSigned: 0,
    });

    const outputDir = ctx.getGogolOutputDir(this.id);
    await ensureOutputDir(outputDir);

    const reporter = new SignSourceReporter(outputDir, toFactoryRelativePath);
    const nowIso = new Date().toISOString();

    await reporter.writeManifest(manifest);
    await reporter.writeSummary({
      appId: '3-extract-profile',
      appVersion: APP_VERSION,
      deviceId: signingKey.collectorId,
      sourceToken: state.brief.sourceToken,
      dbPath: pagesDbPath,
      contentHash,
      signingKeyId: manifest.signing_key_id,
      completedAt: nowIso,
    });
    await reporter.writeSummaryMd({
      appId: '3-extract-profile',
      appVersion: APP_VERSION,
      deviceId: signingKey.collectorId,
      sourceToken: state.brief.sourceToken,
      dbPath: pagesDbPath,
      contentHash,
      signingKeyId: manifest.signing_key_id,
      completedAt: nowIso,
    });

    console.log(`[sign-source] pages.db signed. hash=${contentHash} key=${manifest.signing_key_id}`);
  }
}
