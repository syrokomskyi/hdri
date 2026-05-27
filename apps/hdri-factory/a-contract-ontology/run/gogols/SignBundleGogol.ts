/*
<MODULE_CONTRACT>
<purpose>Signs each resolved observation with the device signing key.</purpose>
<keywords>signing, bundle, cryptographic</keywords>
<responsibilities>
  <item>Loads the signing key from environment.</item>
  <item>Strips the internal _device_id helper before signing.</item>
  <item>Calls signObservation for each resolved observation.</item>
  <item>Stores signed observations in pipeline state.</item>
</responsibilities>
<non-goals>
  <item>Do not resolve conflicts — that is done by ResolveConflictsGogol.</item>
  <item>Do not emit the bundle — that is done by EmitBundleGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SignBundleGogol">Gogol that signs resolved observations.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add incremental progress output via logProgress from @org/utils during signing.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import { loadSigningKeyFromEnv, signObservation } from '@org/observatory-crypto';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';

export class SignBundleGogol extends Gogol {
  override readonly id = 'sign-bundle';

  override async run(ctx: PipelineContext): Promise<void> {
    const { resolvedObs } = ctx.state;
    if (resolvedObs.length === 0) throw new Error('No observations to sign — run resolve-conflicts first');

    const signingKey = loadSigningKeyFromEnv();
    const total = resolvedObs.length;
    const signed = resolvedObs.map((obs, i) => {
      const { _device_id, ...clean } = obs;
      void _device_id;
      logProgress('sign-bundle', i + 1, total, 1000, true);
      return signObservation(clean, signingKey);
    });

    console.log(`[sign-bundle] Signed ${signed.length} observations with key ${signingKey.signingKeyId}`);

    ctx.state.signed = signed;
  }
}
