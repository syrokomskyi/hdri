/*
<MODULE_CONTRACT>
<purpose>Abstract base class for all observatory gogols.</purpose>
<keywords>gogol, pipeline step, abstraction</keywords>
<responsibilities>
  <item>Extends shared PipelineStep with observatory-specific context.</item>
  <item>Provides artifact path resolution and skip logic.</item>
</responsibilities>
<non-goals>
  <item>Do not implement concrete processing logic — subclasses define that.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Gogol">Abstract base for observatory pipeline steps.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

import { PipelineStep } from '@org/pipeline-core/step';
import type { GogolArtifacts, PipelineContext } from './types';

export abstract class Gogol extends PipelineStep<PipelineContext> {
  override readonly artifacts: GogolArtifacts = {};

  override getPromptFileNames(): string[] {
    return super.getPromptFileNames();
  }

  override getArtifactPath(ctx: PipelineContext, artifactId: string): string {
    return ctx.getGogolArtifactPath(this.id, artifactId);
  }

  override getSkipIds(ctx: PipelineContext): string[] {
    return ctx.state.brief.skipGogols;
  }

  abstract override run(ctx: PipelineContext): Promise<void>;
}
