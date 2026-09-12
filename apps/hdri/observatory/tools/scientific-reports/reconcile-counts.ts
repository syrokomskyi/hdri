/*
<MODULE_CONTRACT>
<purpose>Reconciles source ledger, observation, and score counts using set-based reconciliation to detect unexplained references.</purpose>
<non-goals><item>Does not fix counts — reports violations only.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing reconcile-counts module contract for Compass-aware maintenance.</item>
  <item>RFC-0107: replace count equality with set reconciliation. Multiple observations per asset are valid; zero unexplained references is mandatory; unequal entity counts are not automatically an error.</item>
</CHANGE_SUMMARY>
*/

import {
  arg,
  computeInputFingerprint,
  fileExists,
  readJsonFile,
  requireCommonArgs,
  writeReport,
} from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const sourceLedgerPath = arg("--source-ledger");
const observationsPath = arg("--observations");
const scoresPath = arg("--scores");

const violations: string[] = [];
const warnings: string[] = [];

let sourceCount = 0;
let observationCount = 0;
let scoreCount = 0;
let unexplainedRefs = 0;

if (!sourceLedgerPath || !observationsPath || !scoresPath) {
  violations.push("reconciliation_inputs_missing");
} else {
  if (!(await fileExists(sourceLedgerPath))) {
    violations.push("source_ledger_not_found");
  } else if (!(await fileExists(observationsPath))) {
    violations.push("observations_not_found");
  } else if (!(await fileExists(scoresPath))) {
    violations.push("scores_not_found");
  } else {
    const ledger = await readJsonFile<{ batches: { sourceCount: number; sourceIds?: string[] }[] }>(
      sourceLedgerPath,
    );
    sourceCount = ledger.batches.reduce((sum, b) => sum + b.sourceCount, 0);

    const observations = await readJsonFile<{ count: number; refs?: string[] } | string[]>(
      observationsPath,
    );
    observationCount = Array.isArray(observations) ? observations.length : observations.count;

    const scores = await readJsonFile<{ count: number; refs?: string[] } | string[]>(scoresPath);
    scoreCount = Array.isArray(scores) ? scores.length : scores.count;

    const sourceIds = new Set<string>();
    let hasSourceIds = false;
    for (const batch of ledger.batches) {
      if (batch.sourceIds) {
        hasSourceIds = true;
        for (const id of batch.sourceIds) sourceIds.add(id);
      }
    }
    if (!hasSourceIds) warnings.push("source_ids_absent_in_ledger");

    const observationRefs = new Set<string>();
    if (!Array.isArray(observations) && observations.refs) {
      for (const ref of observations.refs) observationRefs.add(ref);
    } else if (Array.isArray(observations)) {
      for (const ref of observations) observationRefs.add(String(ref));
    }

    const scoreRefs = new Set<string>();
    if (!Array.isArray(scores) && scores.refs) {
      for (const ref of scores.refs) scoreRefs.add(ref);
    } else if (Array.isArray(scores)) {
      for (const ref of scores) scoreRefs.add(String(ref));
    }

    for (const obsRef of observationRefs) {
      if (sourceIds.size > 0 && !sourceIds.has(obsRef)) {
        unexplainedRefs++;
      }
    }
    for (const scoreRef of scoreRefs) {
      if (observationRefs.size > 0 && !observationRefs.has(scoreRef)) {
        unexplainedRefs++;
      }
    }

    if (unexplainedRefs > 0) {
      violations.push(`unexplained_references:${unexplainedRefs}`);
    }
  }
}

await writeReport(
  "reconciliation",
  "reconciliation.json",
  evidenceDir,
  period,
  capsuleId,
  computeInputFingerprint(
    period,
    capsuleId,
    sourceLedgerPath ?? "",
    observationsPath ?? "",
    scoresPath ?? "",
  ),
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  [],
  { sourceCount, observationCount, scoreCount, unexplainedRefs },
);
