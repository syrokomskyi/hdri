/*
<MODULE_CONTRACT>
<purpose>Verifies upstream 0-harvest-source signatures before consuming core.db files — this module handles verify upstream operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not modify upstream core.db files.</item>
  <item>Do not mint new asset IDs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>findManifestPath now filters by manifest.app_id instead of directory name suffix for robustness.</item>
  <item>Load verification keys from repo-root transparency/keys/ via getTransparencyKeysDir() from @syrokomskyi/observatory-crypto.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Repair malformed COMPASS CHANGE_SUMMARY scaffolding.</item>
  <item>Migrate to VerifyUpstreamStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated verification workflow.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import { VerifyUpstreamStep } from "@syrokomskyi/pipeline-steps";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";

export class VerifyUpstreamGogol extends VerifyUpstreamStep<PipelineContext> {
  override readonly id = "verify-upstream";

  override readonly guide = {
    title: "Verify upstream signatures",
    purpose:
      "Check ed25519 signatures on every upstream 0-harvest-source core.db before ingestion.",
    decisionType: "auto" as const,
    inputs: [
      "0-harvest-source/.output/<deviceId>/data/db/core_YYYY.db",
      "0-harvest-source/.output/<deviceId>/*-sign-source/source-signature.json",
      "<repo-root>/transparency/keys/*.pem",
    ],
    outputs: ["verify-upstream-summary.json", "verify-upstream-summary.md"],
    definitionOfDone: [
      "All discovered core.db files have a matching verified signature",
      "Content hash in each manifest matches the re-computed SHA-256 of core.db",
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

  protected override getDbFilenames(ctx: PipelineContext): string[] {
    return [`core_${ctx.state.year}.db`];
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
