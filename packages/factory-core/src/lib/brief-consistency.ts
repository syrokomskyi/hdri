/*
<MODULE_CONTRACT>
<purpose>Validates capsuleId and period consistency across factory root, contract ontology, and observatory briefs before any pipeline starts.</purpose>
<non-goals>
  <item>Does not read brief files — callers must supply parsed brief data.</item>
  <item>Does not validate UUID v7 format — use assertCapsuleId for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0043: initial creation of pre-flight consistency guard.</item>
  <item>RFC-0067: add priorCapsuleIds uniqueness check against prior quarters.</item>
</CHANGE_SUMMARY>
*/

import { periodFromSourceToken } from "@syrokomskyi/observatory-crypto";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";

export type BriefConsistencyInput = {
  factoryRootBrief: { sourceToken: string; capsuleId: string };
  contractOntologyBrief: { period: string; capsuleId: string };
  observatoryBrief: { period: string; capsuleId: string };
  priorCapsulesExists: boolean;
  isFirstQuarter: boolean;
  priorCapsuleIds: string[];
};

export const validateBriefConsistency = (input: BriefConsistencyInput): void => {
  const { factoryRootBrief, contractOntologyBrief, observatoryBrief } = input;

  // 1. capsuleId match across all three briefs
  if (factoryRootBrief.capsuleId !== contractOntologyBrief.capsuleId) {
    throw new Error(
      `capsuleId mismatch: factory root has ${factoryRootBrief.capsuleId}, contract ontology has ${contractOntologyBrief.capsuleId}`,
    );
  }
  if (factoryRootBrief.capsuleId !== observatoryBrief.capsuleId) {
    throw new Error(
      `capsuleId mismatch: factory root has ${factoryRootBrief.capsuleId}, observatory has ${observatoryBrief.capsuleId}`,
    );
  }

  // 1b. capsuleId must not collide with any prior quarter
  if (input.priorCapsuleIds.includes(factoryRootBrief.capsuleId)) {
    throw new PipelinePauseError(
      `Pipeline paused.\ncapsuleId "${factoryRootBrief.capsuleId}" is already used by a prior quarter.\nMint a new UUID v7 for this quarter and update all three briefs:\n  factory/.input/brief.md\n  factory/a-contract-ontology/.input/brief.md\n  observatory/.input/brief.md`,
    );
  }

  // 2. Period match: sourceToken period must match contract ontology and observatory periods
  const sourcePeriod = periodFromSourceToken(factoryRootBrief.sourceToken);
  if (sourcePeriod !== contractOntologyBrief.period) {
    throw new Error(
      `period mismatch: sourceToken implies ${sourcePeriod}, contract ontology has ${contractOntologyBrief.period}`,
    );
  }
  if (sourcePeriod !== observatoryBrief.period) {
    throw new Error(
      `period mismatch: sourceToken implies ${sourcePeriod}, observatory has ${observatoryBrief.period}`,
    );
  }

  // 3. prior-capsules.json existence checks
  if (!input.priorCapsulesExists && !input.isFirstQuarter) {
    throw new Error(
      "prior-capsules.json not found. If this is NOT the first quarter, run `pnpm quarter:init`. If this IS the first quarter, pass --first-quarter or set FIRST_QUARTER=true.",
    );
  }
  if (input.priorCapsulesExists && input.isFirstQuarter) {
    console.warn(
      "[bootstrap] WARNING: prior-capsules.json exists but --first-quarter is set. Stale file?",
    );
  }
};
