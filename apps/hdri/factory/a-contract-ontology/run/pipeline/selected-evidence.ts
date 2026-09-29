/*
<MODULE_CONTRACT>
  <purpose>Read authenticated selected execution evidence for one device and stage during ontology translation.</purpose>
  <non-goals><item>Does not select attempts independently or admit caller-created execution closures.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115 B5: bind translated values and owners to selected CAS results.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Re-read selected CAS by its signed digest; target membership alone is not value provenance.

import { assertVerifiedQuarterExecution, readExecutionCasObject } from "@syrokomskyi/factory-core";
import type { AdmittedSnapshot } from "./types.js";

export async function readSelectedEvidence<T>(
  source: AdmittedSnapshot,
  stageId: string,
  successfulOnly: boolean,
): Promise<Map<string, { sha256: string; payload: T }>> {
  assertVerifiedQuarterExecution(source.execution);
  const stage = source.execution.stages.find((s) => s.stageId === stageId);
  if (!stage || stage.collectorId !== source.deviceId)
    throw new Error(`Missing authenticated selection: ${source.deviceId}/${stageId}`);
  const results = new Map<string, { sha256: string; payload: T }>();
  for (const selected of stage.results) {
    if (successfulOnly && selected.state !== "succeeded") continue;
    const id = selected.key.provisionalAssetId;
    if (results.has(id))
      throw new Error(`Ambiguous selected target: ${source.deviceId}/${stageId}/${id}`);
    results.set(id, {
      sha256: selected.resultSha256,
      payload: await readExecutionCasObject<T>(source.capsuleDir, selected.resultSha256),
    });
  }
  return results;
}

export const selectedEvidenceRef = (sha256: string): string =>
  `staging/execution/cas/${sha256.slice(0, 2)}/${sha256}.json`;
