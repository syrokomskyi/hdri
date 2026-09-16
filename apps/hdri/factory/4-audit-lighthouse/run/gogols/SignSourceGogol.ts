/*
<MODULE_CONTRACT>
<purpose>Creates and signs a closed Lighthouse SQLite snapshot with the device signing key.</purpose>
<non-goals>
  <item>Do not modify lighthouse.db after signing.</item>
  <item>Do not classify or parse source data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Migrate to SignSourceStep base class from @warpgogol/pipeline-steps — eliminates duplicated signing workflow.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: the complete closed snapshot manifest and bytes are covered by Ed25519; never reuse or expose the private key

import { SignSourceStep } from "@syrokomskyi/pipeline-steps-hdri";
import { periodFromSourceToken } from "@syrokomskyi/observatory-crypto";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";
import { getAuditsDbPath } from "../paths.js";

export class SignSourceGogol extends SignSourceStep<PipelineContext> {
  override readonly id = "sign-source";

  override readonly guide = {
    title: "Sign source",
    purpose:
      "Create a closed source-snapshot.sqlite and cryptographically seal its complete manifest for downstream verification.",
    decisionType: "auto" as const,
    inputs: ["lighthouse.db (final, fully populated)"],
    outputs: [
      "source-signature.json (ed25519 signature manifest)",
      "sign-source-summary.json",
      "sign-source-summary.md",
    ],
    definitionOfDone: [
      "SHA-256 of lighthouse.db computed",
      "ed25519 signature created with device signing key",
      "Signature manifest written with key ID and timestamp",
    ],
  };

  protected override getAppId(): string {
    return "4-audit-lighthouse";
  }

  protected override getDbPath(ctx: PipelineContext): string {
    return getAuditsDbPath(periodFromSourceToken(ctx.state.brief.sourceToken));
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.brief.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }

  protected override getLogLabel(): string | undefined {
    return "lighthouse.db";
  }
}
