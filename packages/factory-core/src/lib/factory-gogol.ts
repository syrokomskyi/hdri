/*
<MODULE_CONTRACT>
<purpose>Extend pipeline steps to manage HDRI Gogol artifacts within a processing context.</purpose>
<non-goals>
  <item>Does not handle the creation or modification of HDRI images.</item>
  <item>Does not perform any file I/O operations directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the HdriFactoryGogol class with abstract methods.</item>
</CHANGE_SUMMARY>
*/

import { PipelineStep } from "@syrokomskyi/pipeline-core/step";
import type { HdriFactoryContext, HdriFactoryGogolArtifacts } from "./types.js";

export abstract class HdriFactoryGogol<
  C extends HdriFactoryContext = HdriFactoryContext,
> extends PipelineStep<C> {
  override readonly artifacts: HdriFactoryGogolArtifacts<C> = {};

  override getPromptFileNames(): string[] {
    return [];
  }

  override getArtifactPath(ctx: C, artifactId: string): string {
    return ctx.getGogolArtifactPath(this.id, artifactId);
  }

  override async shouldSkip(ctx: C): Promise<boolean> {
    return ctx.state.brief.skipGogols.includes(this.id);
  }

  abstract override run(ctx: C): Promise<void>;
}
