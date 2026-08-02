/*
<MODULE_CONTRACT>
<purpose>Capture environment profile for axe audit reproducibility — delegates to shared CaptureEnvironmentProfileStep base class.</purpose>
<non-goals>
  <item>Do not modify system state.</item>
  <item>Do not perform network speed tests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: capture OS, Node, and tool versions into JSON and Markdown artifacts.</item>
  <item>Remove axe prefix from brief field references - this app is Axe-only.</item>
  <item>Phase B cleanup: remove deprecated auditYear, auditToken, cohortId, auditSampleSize, randomSeed, fixtureDir from brief snapshot.</item>
  <item>Skip re-run when environment-profile.json already exists in output directory.</item>
  <item>Fix formatMarkdown: replace stale lighthouse/cohort fields with actual brief fields (sourceToken, auditYear, concurrency, timeoutMs, retries).</item>
  <item>Migrate to CaptureEnvironmentProfileStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated system info, tool version, and formatting logic.</item>
  <item>Add getSkipGogols override to replace as-cast in base class shouldSkip.</item>
</CHANGE_SUMMARY>
*/

import { CaptureEnvironmentProfileStep } from "@syrokomskyi/pipeline-steps";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import type { PipelineContext } from "../pipeline/types.js";

export class CaptureEnvironmentProfileGogol extends CaptureEnvironmentProfileStep<PipelineContext> {
  override readonly id = "capture-environment-profile";

  protected override getBriefSnapshot(ctx: PipelineContext): Record<string, unknown> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    return {
      sourceToken: brief.sourceToken,
      auditYear: year,
      concurrency: brief.concurrency,
      timeoutMs: brief.timeoutMs,
      retries: brief.retries,
    };
  }

  protected override getSkipGogols(ctx: PipelineContext): string[] | undefined {
    return ctx.state.brief.skipGogols;
  }
}
