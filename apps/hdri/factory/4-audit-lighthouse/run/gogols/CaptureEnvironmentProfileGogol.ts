/*
<MODULE_CONTRACT>
<purpose>Capture environment profile for lighthouse audit reproducibility — delegates to shared CaptureEnvironmentProfileStep base class.</purpose>
<non-goals>
  <item>Do not modify system state.</item>
  <item>Do not perform network speed tests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: capture OS, Node, and tool versions into JSON and Markdown artifacts.</item>
  <item>Remove lighthouse prefix from brief field references - this app is Lighthouse-only.</item>
  <item>Skip re-run when environment-profile.json already exists in output directory.</item>
  <item>Migrate to CaptureEnvironmentProfileStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated system info, tool version, and formatting logic. Fixes stale brief field references (lighthouseRetries, fixtureDir).</item>
  <item>Add getSkipGogols override to replace as-cast in base class shouldSkip.</item>
</CHANGE_SUMMARY>
*/

import { CaptureEnvironmentProfileStep } from "@syrokomskyi/pipeline-steps";
import type { PipelineContext } from "../pipeline/types.js";

export class CaptureEnvironmentProfileGogol extends CaptureEnvironmentProfileStep<PipelineContext> {
  override readonly id = "capture-environment-profile";

  protected override getBriefSnapshot(ctx: PipelineContext): Record<string, unknown> {
    const { brief } = ctx.state;
    return {
      sourceToken: brief.sourceToken,
      concurrency: brief.concurrency,
      timeoutMs: brief.timeoutMs,
      retries: brief.retries,
      formFactor: brief.formFactor,
    };
  }

  protected override getSkipGogols(ctx: PipelineContext): string[] | undefined {
    return ctx.state.brief.skipGogols;
  }
}
