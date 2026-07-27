/*
<MODULE_CONTRACT>
<purpose>Signs each resolved observation with the device signing key — this module handles sign bundle operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not resolve conflicts — that is done by ResolveConflictsGogol.</item>
  <item>Do not emit the bundle — that is done by EmitBundleGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add incremental progress output via logProgress from @syrokomskyi/utils during signing.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import "@syrokomskyi/observatory-crypto/auto-env";
import { loadSigningKeyFromEnv, signObservation } from "@syrokomskyi/observatory-crypto";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";

export class SignBundleGogol extends Gogol {
  override readonly id = "sign-bundle";

  override async run(ctx: PipelineContext): Promise<void> {
    const { resolvedObs } = ctx.state;
    if (resolvedObs.length === 0)
      throw new Error("No observations to sign — run resolve-conflicts first");

    const signingKey = loadSigningKeyFromEnv();
    const total = resolvedObs.length;
    const signed = resolvedObs.map((obs, i) => {
      const { _device_id, ...clean } = obs;
      void _device_id;
      logProgress("sign-bundle", i + 1, total, 1000, true);
      return signObservation(clean, signingKey);
    });

    console.log(
      `[sign-bundle] Signed ${signed.length} observations with key ${signingKey.signingKeyId}`,
    );

    ctx.state.signed = signed;
  }
}
