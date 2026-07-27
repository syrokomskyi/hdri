/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 4-audit-lighthouse signatures before consuming lighthouse_YYYY.db files — this module handles verify upstream operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not modify upstream lighthouse_YYYY.db files.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Fix COMPASS header: correct file references from generic lighthouse.db to lighthouse_YYYY.db.</item>
  <item>Migrate to VerifyUpstreamStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated verification workflow.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import { VerifyUpstreamStep } from "@syrokomskyi/pipeline-steps";
import { toFactoryRelativePath, upstreamLighthouseOutputRoot } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";

export class VerifyUpstreamGogol extends VerifyUpstreamStep<PipelineContext> {
  override readonly id = "verify-upstream";

  override readonly guide = {
    title: "Verify upstream signatures",
    purpose:
      "Check ed25519 signatures on every upstream 4-audit-lighthouse lighthouse.db before ingestion.",
    decisionType: "auto" as const,
    inputs: [
      "4-audit-lighthouse/.output/<deviceId>/data/db/lighthouse_YYYY.db",
      "4-audit-lighthouse/.output/<deviceId>/*-sign-source/source-signature.json",
      "<repo-root>/transparency/keys/*.pem",
    ],
    outputs: ["verify-upstream-summary.json", "verify-upstream-summary.md"],
    definitionOfDone: [
      "All discovered lighthouse.db files have a matching verified signature",
      "Content hash in each manifest matches the re-computed SHA-256 of lighthouse.db",
      "Verification summary written",
    ],
  };

  protected override getAppId(): string {
    return "5-audit-axe";
  }

  protected override getExpectedUpstreamAppId(): string {
    return "4-audit-lighthouse";
  }

  protected override getUpstreamRoot(_ctx: PipelineContext): string {
    return upstreamLighthouseOutputRoot;
  }

  protected override getDbFilenames(ctx: PipelineContext): string[] {
    return [`lighthouse_${ctx.state.brief.year}.db`];
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
