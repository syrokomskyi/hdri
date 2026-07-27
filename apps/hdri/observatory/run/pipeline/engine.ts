/*
<MODULE_CONTRACT>
<purpose>Thin wrapper over the shared pipeline engine for the observatory app.</purpose>
<non-goals>
  <item>Do not implement step logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled engine wrapper with shared createPipelineEngine from @syrokomskyi/pipeline-node/engine.</item>
</CHANGE_SUMMARY>
*/

import { createPipelineEngine } from "@syrokomskyi/pipeline-node/engine";
import { createPipelineContext } from "./context/create-context";
import type { ObservatoryPipelineStep } from "./build-types";
import type { PipelineContext, PipelineState } from "./types";

export type { PipelineRunOptions } from "@syrokomskyi/pipeline-core";

export type PipelineEngineClients = Record<string, never>;

export const runPipelineEngine = createPipelineEngine<
  PipelineState,
  PipelineContext,
  ObservatoryPipelineStep,
  PipelineEngineClients
>({
  createContext: (options) =>
    createPipelineContext({
      gogolArtifactsById: options.stepArtifactsById,
      gogolNumbers: options.stepNumbers,
      state: options.state,
      clients: options.clients,
    }),
});
