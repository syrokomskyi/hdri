/*
<MODULE_CONTRACT>
<purpose>Signs the registry content hash with the device signing key.</purpose>
<keywords>sign, signature, ed25519, content-hash, traceability</keywords>
<responsibilities>
  <item>Computes content hash over all registry rows.</item>
  <item>Creates ed25519 signature manifest with source metadata.</item>
  <item>Writes source-signature.json manifest.</item>
  <item>Writes sign-source-summary.json and sign-source-summary.md.</item>
</responsibilities>
<non-goals>
  <item>Do not modify the registry database after signing.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SignSourceGogol">Signs registry content for traceability.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation extracted from monolithic main.ts.</item>
  <item>Normalise registryDbPath and signature manifest path to relative in sign-source-summary.json and sign-source-summary.md artifacts using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
  <item>Refactor to use SignSourceReporter from @org/observatory-emit for artifact emission.</item>
</CHANGE_SUMMARY>
*/

import { hashDatabaseFile } from '@org/business-core/cross-db';
import { loadSigningKeyFromEnv, signSource } from '@org/observatory-crypto';
import { SignSourceReporter } from '@org/observatory-emit';
import { toFactoryRelativePath } from '../config.js';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';

const APP_VERSION = '0.1.0';

export class SignSourceGogol extends Gogol {
  override readonly id = 'sign-source';

  override readonly guide = {
    title: 'Sign source',
    purpose: 'Create cryptographic signature over registry content hash for downstream verification and traceability.',
    decisionType: 'auto' as const,
    inputs: ['registry_YYYY.db business_registry table'],
    outputs: [
      'source-signature.json (ed25519 signature manifest)',
      'sign-source-summary.json',
      'sign-source-summary.md',
    ],
    definitionOfDone: [
      'Content hash computed over all registry rows',
      'ed25519 signature created with device signing key',
      'Signature manifest written with key ID and timestamp',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;

    const signingKey = loadSigningKeyFromEnv();

    const contentHash = await hashDatabaseFile(state.localDbPath);
    const manifest = signSource({
      signingKey,
      sourceToken: state.sourceToken,
      appId: '1-register-businesses',
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
      appId: '1-register-businesses',
      appVersion: APP_VERSION,
      deviceId: state.deviceId,
      sourceToken: state.sourceToken,
      dbPath: state.localDbPath,
      contentHash,
      signingKeyId: manifest.signing_key_id,
      completedAt: nowIso,
    });
    await reporter.writeSummaryMd(
      {
        appId: '1-register-businesses',
        appVersion: APP_VERSION,
        deviceId: state.deviceId,
        sourceToken: state.sourceToken,
        dbPath: state.localDbPath,
        contentHash,
        signingKeyId: manifest.signing_key_id,
        completedAt: nowIso,
      },
      [['DB file', state.localDbPath]],
    );

    // Update state
    state.contentHash = contentHash;
  }
}
