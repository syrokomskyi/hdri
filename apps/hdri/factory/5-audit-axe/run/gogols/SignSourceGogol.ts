/*
<MODULE_CONTRACT>
<purpose>Signs the axe.db file hash with the device signing key.</purpose>
<non-goals>
  <item>Do not modify axe.db after signing.</item>
  <item>Do not classify or parse source data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Migrate to SignSourceStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated signing workflow.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import { SignSourceStep } from "@syrokomskyi/pipeline-steps";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";
import { getAuditsDbPath } from "../paths.js";

export class SignSourceGogol extends SignSourceStep<PipelineContext> {
  override readonly id = "sign-source";

  override readonly guide = {
    title: "Sign source",
    purpose:
      "Create cryptographic signature over axe.db file hash for downstream verification and traceability.",
    decisionType: "auto" as const,
    inputs: ["axe.db (final, fully populated)"],
    outputs: [
      "source-signature.json (ed25519 signature manifest)",
      "sign-source-summary.json",
      "sign-source-summary.md",
    ],
    definitionOfDone: [
      "SHA-256 of axe.db computed",
      "ed25519 signature created with device signing key",
      "Signature manifest written with key ID and timestamp",
    ],
  };

  protected override getAppId(): string {
    return "5-audit-axe";
  }

  protected override getDbPath(ctx: PipelineContext): string {
    const { year, quarter } = parseSourceToken(ctx.state.brief.sourceToken);
    return getAuditsDbPath(`${year}-q${quarter}`);
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.brief.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }

  protected override getLogLabel(): string | undefined {
    return "axe.db";
  }
}
