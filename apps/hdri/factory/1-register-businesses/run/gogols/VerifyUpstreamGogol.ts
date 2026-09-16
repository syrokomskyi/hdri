/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 0-harvest-source closed snapshot manifests before consuming source data.</purpose>
<non-goals>
  <item>Do not modify upstream source snapshots.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>findManifestPath now filters by manifest.app_id instead of directory name suffix for robustness.</item>
  <item>Load verification keys from repo-root transparency/keys/ via getTransparencyKeysDir() from @syrokomskyi/observatory-crypto.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Repair malformed COMPASS CHANGE_SUMMARY scaffolding.</item>
  <item>Migrate to VerifyUpstreamStep base class from @warpgogol/pipeline-steps — eliminates duplicated verification workflow.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: the complete closed snapshot manifest and bytes are verified before consumption; never reuse or expose the private key

import { VerifyUpstreamStep } from "@syrokomskyi/pipeline-steps-hdri";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";

export class VerifyUpstreamGogol extends VerifyUpstreamStep<PipelineContext> {
  override readonly id = "verify-upstream";

  override readonly guide = {
    title: "Verify upstream signatures",
    purpose:
      "Check every upstream 0-harvest-source closed snapshot manifest and snapshot before ingestion.",
    decisionType: "auto" as const,
    inputs: [
      "0-harvest-source/.output/<deviceId>/*-sign-source/source-snapshot.sqlite",
      "0-harvest-source/.output/<deviceId>/*-sign-source/source-signature.json",
      "<repo-root>/transparency/keys/*.pem",
    ],
    outputs: ["verify-upstream-summary.json", "verify-upstream-summary.md"],
    definitionOfDone: [
      "Every discovered source snapshot has a matching verified manifest",
      "Manifest scope, signature, size, and SHA-256 match the snapshot bytes",
      "Verification summary written",
    ],
  };

  protected override getAppId(): string {
    return "1-register-businesses";
  }

  protected override getExpectedUpstreamAppId(): string {
    return "0-harvest-source";
  }

  protected override getUpstreamRoot(ctx: PipelineContext): string {
    return ctx.state.upstreamHarvestOutputRoot;
  }

  protected override getYear(ctx: PipelineContext): number {
    return ctx.state.year;
  }

  protected override getDeviceId(ctx: PipelineContext): string {
    return ctx.state.deviceId;
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }
}
