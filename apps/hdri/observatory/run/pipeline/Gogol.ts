/*
<MODULE_CONTRACT>
<purpose>Abstract base class for all observatory gogols via the shared createGogolBase factory.</purpose>
<non-goals>
  <item>Do not implement concrete processing logic — subclasses define that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled Gogol base with shared createGogolBase from @syrokomskyi/pipeline-node.</item>
  <item>Remove redundant getArtifactPath override — base PipelineStep already calls ctx.getStepArtifactPath.</item>
  <item>Remove redundant getPromptFileNames override — was just calling super.</item>
</CHANGE_SUMMARY>
*/

import { createGogolBase, skipFromBrief } from "@syrokomskyi/pipeline-node";
import type { PipelineContext } from "./types";

const Base = createGogolBase<PipelineContext>({
  getSkipIds: skipFromBrief,
});

export abstract class Gogol extends Base {}
