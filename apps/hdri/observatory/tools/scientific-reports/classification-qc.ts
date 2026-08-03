/*
<MODULE_CONTRACT>
<purpose>Validates classification QC: confusion matrix, precision, and policy thresholds.</purpose>
<non-goals><item>Does not re-classify sites — validates existing predictions against a frozen sample.</item></non-goals>
</MODULE_CONTRACT>
*/

import path from "node:path";
import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const predictionsPath = arg("--predictions");
const samplePath = arg("--sample");
const policyPath = arg("--policy");

const violations: string[] = [];
const warnings: string[] = [];
const hardSuppressions: string[] = [];

let precision: number | undefined;
let confusionMatrix: Record<string, Record<string, number>> | undefined;

if (!predictionsPath || !samplePath) {
  violations.push("classification_inputs_missing");
} else {
  if (!(await fileExists(path.resolve(predictionsPath)))) {
    violations.push("predictions_file_not_found");
  } else if (!(await fileExists(path.resolve(samplePath)))) {
    violations.push("sample_file_not_found");
  } else {
    const predictions = await readJsonFile<Record<string, string>>(path.resolve(predictionsPath));
    const sample = await readJsonFile<Record<string, { predicted: string; validated: string }>>(
      path.resolve(samplePath),
    );

    const labels = new Set<string>();
    for (const item of Object.values(sample)) {
      labels.add(item.validated);
      labels.add(item.predicted);
    }
    const labelList = [...labels].sort();
    const matrix: Record<string, Record<string, number>> = {};
    for (const row of labelList) {
      matrix[row] = {};
      for (const col of labelList) matrix[row][col] = 0;
    }
    let correct = 0;
    let total = 0;
    for (const [id, item] of Object.entries(sample)) {
      const predicted = predictions[id] ?? item.predicted;
      matrix[item.validated][predicted] = (matrix[item.validated][predicted] ?? 0) + 1;
      if (predicted === item.validated) correct++;
      total++;
    }
    confusionMatrix = matrix;
    precision = total > 0 ? correct / total : 0;

    let minPrecision = 0.8;
    if (policyPath && (await fileExists(path.resolve(policyPath)))) {
      const policy = await readJsonFile<{ minPrecision?: number }>(path.resolve(policyPath));
      if (typeof policy.minPrecision === "number") minPrecision = policy.minPrecision;
    }

    if (precision < minPrecision) {
      violations.push(`classification_precision_below_threshold:${precision.toFixed(4)}`);
    }
    if (total < 50) warnings.push("classification_sample_small");
  }
}

await writeReport(
  "classification-qc",
  "classification-qc.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  hardSuppressions,
  { precision, confusionMatrix },
);
