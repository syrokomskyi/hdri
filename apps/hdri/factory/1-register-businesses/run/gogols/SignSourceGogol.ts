/*
<MODULE_CONTRACT>
<purpose>Signs the registry content hash with the device signing key.</purpose>
<non-goals>
  <item>Do not modify the registry database after signing.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation extracted from monolithic main.ts.</item>
  <item>Normalise registryDbPath and signature manifest path to relative in sign-source-summary.json and sign-source-summary.md artifacts using toRelativePath from @syrokomskyi/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Refactor to use SignSourceReporter from @syrokomskyi/observatory-emit for artifact emission.</item>
  <item>Migrate to SignSourceStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated signing workflow.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import { SignSourceStep } from "@syrokomskyi/pipeline-steps";
import type { SignSummary } from "@syrokomskyi/pipeline-steps";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";

export class SignSourceGogol extends SignSourceStep<PipelineContext> {
  override readonly id = "sign-source";

  override readonly guide = {
    title: "Sign source",
    purpose:
      "Create cryptographic signature over registry content hash for downstream verification and traceability.",
    decisionType: "auto" as const,
    inputs: ["registry_YYYY.db business_registry table"],
    outputs: [
      "source-signature.json (ed25519 signature manifest)",
      "sign-source-summary.json",
      "sign-source-summary.md",
    ],
    definitionOfDone: [
      "Content hash computed over all registry rows",
      "ed25519 signature created with device signing key",
      "Signature manifest written with key ID and timestamp",
    ],
  };

  protected override getAppId(): string {
    return "1-register-businesses";
  }

  protected override getDbPath(ctx: PipelineContext): string {
    return ctx.state.localDbPath;
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }

  protected override getDeviceId(ctx: PipelineContext): string {
    return ctx.state.deviceId;
  }

  protected override getExtraMdRows(ctx: PipelineContext): Array<[string, string]> {
    return [["DB file", ctx.state.localDbPath]];
  }

  protected override onSigned(ctx: PipelineContext, summary: SignSummary): void {
    ctx.state.contentHash = summary.contentHash;
  }
}
