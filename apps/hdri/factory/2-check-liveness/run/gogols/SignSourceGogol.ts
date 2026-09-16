/*
<MODULE_CONTRACT>
<purpose>Creates and signs a closed liveness SQLite snapshot with the device signing key.</purpose>
<non-goals>
  <item>Do not modify liveness.db after signing.</item>
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
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";
import { getLivenessDbPath } from "../paths.js";

export class SignSourceGogol extends SignSourceStep<PipelineContext> {
  override readonly id = "sign-source";

  override readonly guide = {
    title: "Sign source",
    purpose:
      "Create a closed source-snapshot.sqlite and cryptographically seal its complete manifest for downstream verification.",
    decisionType: "auto" as const,
    inputs: ["liveness.db (final, fully populated)"],
    outputs: [
      "source-signature.json (ed25519 signature manifest)",
      "sign-source-summary.json",
      "sign-source-summary.md",
    ],
    definitionOfDone: [
      "SHA-256 of liveness.db computed",
      "ed25519 signature created with device signing key",
      "Signature manifest written with key ID and timestamp",
    ],
  };

  protected override getAppId(): string {
    return "2-check-liveness";
  }

  protected override getDbPath(ctx: PipelineContext): string {
    const { year, quarter } = parseSourceToken(ctx.state.brief.sourceToken);
    return getLivenessDbPath(`${year}-q${quarter}`);
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.brief.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }

  protected override getLogLabel(): string | undefined {
    return "liveness.db";
  }
}
