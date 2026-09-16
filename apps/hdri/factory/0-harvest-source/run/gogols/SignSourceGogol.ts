/*
<MODULE_CONTRACT>
<purpose>Creates and signs a closed core SQLite snapshot with the device signing key.</purpose>
<non-goals>
  <item>Do not modify the source snapshot after signing.</item>
  <item>Do not classify or parse source data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Refactor to use SignSourceReporter from @syrokomskyi/observatory-emit for artifact emission.</item>
  <item>Migrate to SignSourceStep base class from @warpgogol/pipeline-steps — eliminates duplicated signing workflow.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: the complete closed snapshot manifest and bytes are covered by Ed25519; never reuse or expose the private key

import { SignSourceStep } from "@syrokomskyi/pipeline-steps-hdri";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { toFactoryRelativePath } from "../config.js";
import type { PipelineContext } from "../pipeline/types.js";
import { getCoreDbPath } from "../paths.js";

export class SignSourceGogol extends SignSourceStep<PipelineContext> {
  override readonly id = "sign-source";

  override readonly guide = {
    title: "Sign source",
    purpose:
      "Create a closed source-snapshot.sqlite and cryptographically seal its complete manifest for downstream verification.",
    decisionType: "auto" as const,
    inputs: ["core.db (final, fully populated)"],
    outputs: [
      "source-signature.json (ed25519 signature manifest)",
      "sign-source-summary.json",
      "sign-source-summary.md",
    ],
    definitionOfDone: [
      "Closed source-snapshot.sqlite passes integrity and size/hash checks",
      "Complete v2 manifest signed with device signing key",
    ],
  };

  protected override getAppId(): string {
    return "0-harvest-source";
  }

  protected override getDbPath(ctx: PipelineContext): string {
    const { year } = parseSourceToken(ctx.state.brief.sourceToken);
    return getCoreDbPath(year);
  }

  protected override getSourceToken(ctx: PipelineContext): string {
    return ctx.state.brief.sourceToken;
  }

  protected override toRelativePath(p: string): string {
    return toFactoryRelativePath(p);
  }

  protected override getLogLabel(): string | undefined {
    return "core.db";
  }
}
