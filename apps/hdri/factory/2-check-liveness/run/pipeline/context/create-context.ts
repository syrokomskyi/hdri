/*
<MODULE_CONTRACT>
<purpose>Composes the pipeline context for the check-liveness app from shared HDRI factory context and app-specific options.</purpose>
<non-goals>
  <item>Does not define the shared context factory itself.</item>
  <item>Does not manage individual gogol step contexts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { createHdriFactoryContext } from "@syrokomskyi/factory-core";
import { inputDir, outputRootDir, promptsDir } from "../../config.js";
import type {
  GogolArtifacts,
  PipelineAiServices,
  PipelineContext,
  PipelineState,
} from "../types.js";

export type PipelineClientsForContext = PipelineAiServices;

export const createPipelineContext = (options: {
  gogolArtifactsById: Map<string, GogolArtifacts>;
  gogolNumbers: Map<string, number>;
  state: PipelineState;
  clients: PipelineClientsForContext;
}): PipelineContext =>
  createHdriFactoryContext<PipelineState>({
    inputDir,
    outputDir: outputRootDir,
    promptsDir,
    gogolArtifactsById: options.gogolArtifactsById,
    gogolNumbers: options.gogolNumbers,
    state: options.state,
    clients: options.clients,
  }) as PipelineContext;
