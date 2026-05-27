/*
<MODULE_CONTRACT>
<purpose>Signs the liveness.db file hash with the device signing key.</purpose>
<keywords>sign, signature, ed25519, content-hash, traceability, liveness.db</keywords>
<responsibilities>
  <item>Computes SHA-256 hash of the final liveness.db file.</item>
  <item>Creates ed25519 signature manifest with source metadata.</item>
  <item>Writes source-signature.json manifest.</item>
  <item>Writes sign-source-summary.json and sign-source-summary.md.</item>
</responsibilities>
<non-goals>
  <item>Do not modify liveness.db after signing.</item>
  <item>Do not classify or parse source data.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SignSourceGogol">Signs liveness.db file hash for downstream verification.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { parseSourceToken } from '@org/observatory-crypto';
import { hashDatabaseFile } from '@org/business-core/cross-db';
import { loadSigningKeyFromEnv, signSource } from '@org/observatory-crypto';
import { SignSourceReporter } from '@org/observatory-emit';
import { toFactoryRelativePath } from '../config.js';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { getLivenessDbPath } from '../paths.js';

const APP_VERSION = '0.1.0';

export class SignSourceGogol extends Gogol {
  override readonly id = 'sign-source';

  override readonly guide = {
    title: 'Sign source',
    purpose: 'Create cryptographic signature over liveness.db file hash for downstream verification and traceability.',
    decisionType: 'auto' as const,
    inputs: ['liveness.db (final, fully populated)'],
    outputs: [
      'source-signature.json (ed25519 signature manifest)',
      'sign-source-summary.json',
      'sign-source-summary.md',
    ],
    definitionOfDone: [
      'SHA-256 of liveness.db computed',
      'ed25519 signature created with device signing key',
      'Signature manifest written with key ID and timestamp',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const { year } = parseSourceToken(state.brief.sourceToken);
    const livenessDbPath = getLivenessDbPath(year);

    const signingKey = loadSigningKeyFromEnv();

    const contentHash = await hashDatabaseFile(livenessDbPath);
    const manifest = signSource({
      signingKey,
      sourceToken: state.brief.sourceToken,
      appId: '2-check-liveness',
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
      appId: '2-check-liveness',
      appVersion: APP_VERSION,
      deviceId: signingKey.collectorId,
      sourceToken: state.brief.sourceToken,
      dbPath: livenessDbPath,
      contentHash,
      signingKeyId: manifest.signing_key_id,
      completedAt: nowIso,
    });
    await reporter.writeSummaryMd({
      appId: '2-check-liveness',
      appVersion: APP_VERSION,
      deviceId: signingKey.collectorId,
      sourceToken: state.brief.sourceToken,
      dbPath: livenessDbPath,
      contentHash,
      signingKeyId: manifest.signing_key_id,
      completedAt: nowIso,
    });

    console.log(`[sign-source] liveness.db signed. hash=${contentHash} key=${manifest.signing_key_id}`);
  }
}
