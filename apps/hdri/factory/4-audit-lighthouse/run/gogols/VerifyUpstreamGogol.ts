/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 3-extract-profile closed snapshot manifests before consuming source data.</purpose>
<non-goals>
  <item>Do not modify upstream source snapshots.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Migrate to VerifyUpstreamStep base class from @warpgogol/pipeline-steps — eliminates duplicated verification workflow.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: the complete closed snapshot manifest and bytes are verified before consumption; never reuse or expose the private key

import { VerifyUpstreamStep } from "@syrokomskyi/pipeline-steps-hdri";
import { toFactoryRelativePath, upstreamProfileOutputRoot } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";

export class VerifyUpstreamGogol extends VerifyUpstreamStep<PipelineContext> {
  override readonly id = "verify-upstream";

  override readonly guide = {
    title: "Verify upstream signatures",
    purpose:
      "Check every upstream 3-extract-profile closed snapshot manifest and snapshot before ingestion.",
    decisionType: "auto" as const,
    inputs: [
      "3-extract-profile/.output/<deviceId>/*-sign-source/source-snapshot.sqlite",
      "3-extract-profile/.output/<deviceId>/*-sign-source/source-signature.json",
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
    return "4-audit-lighthouse";
  }

  protected override getExpectedUpstreamAppId(): string {
    return "3-extract-profile";
  }

  protected override getUpstreamRoot(_ctx: PipelineContext): string {
    return upstreamProfileOutputRoot;
  }

  protected override getYear(ctx: PipelineContext): number {
    return ctx.state.brief.year;
  }

  protected override getDeviceId(ctx: PipelineContext): string {
    return ctx.state.brief.deviceId;
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.brief.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }
}
