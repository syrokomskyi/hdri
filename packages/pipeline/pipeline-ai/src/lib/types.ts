/*
<MODULE_CONTRACT>
<purpose>Defines shared types for AI provider logging and configuration.</purpose>
<non-goals>
  <item>Does not implement logging logic itself.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of shared AI logger types.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineAiLogOptions, TokenUsage } from "@syrokomskyi/pipeline-core";

export type AiLogger = {
  logCall: (options: PipelineAiLogOptions) => Promise<string | null>;
  writeResponse: (
    callDir: string | null,
    responses: PipelineAiLogOptions["responses"],
  ) => Promise<void>;
  writeUsage?: (callDir: string | null, usage: TokenUsage) => Promise<void>;
  logStepEvent?: (event: {
    event: string;
    status?: string;
    operation?: string;
    provider?: string;
    model?: string;
    details?: Record<string, unknown>;
  }) => Promise<void>;
};
