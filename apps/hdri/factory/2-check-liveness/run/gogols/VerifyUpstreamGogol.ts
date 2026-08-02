/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 1-register-businesses signatures before consuming registry.db files — this module handles verify upstream operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not modify upstream registry.db files.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Migrate to VerifyUpstreamStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated verification workflow.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import { VerifyUpstreamStep } from "@syrokomskyi/pipeline-steps";
import { toFactoryRelativePath, upstreamRegisterBusinessesOutputRoot } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";

export class VerifyUpstreamGogol extends VerifyUpstreamStep<PipelineContext> {
  override readonly id = "verify-upstream";

  override readonly guide = {
    title: "Verify upstream signatures",
    purpose:
      "Check ed25519 signatures on every upstream 1-register-businesses registry.db before ingestion.",
    decisionType: "auto" as const,
    inputs: [
      "1-register-businesses/.output/<deviceId>/data/db/registry_YYYY.db",
      "1-register-businesses/.output/<deviceId>/*-sign-source/source-signature.json",
      "<repo-root>/transparency/keys/*.pem",
    ],
    outputs: ["verify-upstream-summary.json", "verify-upstream-summary.md"],
    definitionOfDone: [
      "All discovered registry.db files have a matching verified signature",
      "Content hash in each manifest matches the re-computed SHA-256 of registry.db",
      "Verification summary written",
    ],
  };

  protected override getAppId(): string {
    return "2-check-liveness";
  }

  protected override getExpectedUpstreamAppId(): string {
    return "1-register-businesses";
  }

  protected override getUpstreamRoot(_ctx: PipelineContext): string {
    return upstreamRegisterBusinessesOutputRoot;
  }

  protected override getDbFilenames(ctx: PipelineContext): string[] {
    return [`registry_${ctx.state.brief.year}.db`];
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
