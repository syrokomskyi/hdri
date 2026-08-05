/*
<MODULE_CONTRACT>
<purpose>Reconciles source ledger, observation, and score counts to detect any count violations.</purpose>
<non-goals><item>Does not fix counts — reports violations only.</item></non-goals>
</MODULE_CONTRACT>
*/

import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const sourceLedgerPath = arg("--source-ledger");
const observationsPath = arg("--observations");
const scoresPath = arg("--scores");

const violations: string[] = [];
const warnings: string[] = [];

let sourceCount = 0;
let observationCount = 0;
let scoreCount = 0;

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
    const ledger = await readJsonFile<{ batches: { sourceCount: number }[] }>(sourceLedgerPath);
    sourceCount = ledger.batches.reduce((sum, b) => sum + b.sourceCount, 0);

    const observations = await readJsonFile<{ count: number } | string[]>(observationsPath);
    observationCount = Array.isArray(observations) ? observations.length : observations.count;

    const scores = await readJsonFile<{ count: number } | string[]>(scoresPath);
    scoreCount = Array.isArray(scores) ? scores.length : scores.count;

    if (sourceCount !== observationCount) {
      violations.push(`source_observation_mismatch:${sourceCount}:${observationCount}`);
    }
    if (observationCount !== scoreCount) {
      violations.push(`observation_score_mismatch:${observationCount}:${scoreCount}`);
    }
  }
}

await writeReport(
  "reconciliation",
  "reconciliation.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  [],
  { sourceCount, observationCount, scoreCount },
);
