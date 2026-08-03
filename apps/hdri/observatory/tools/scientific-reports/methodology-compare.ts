/*
<MODULE_CONTRACT>
<purpose>Compares Q2 and Q3 methodology snapshots to determine comparability and identify hard suppressions.</purpose>
<non-goals><item>Does not perform backcast — only flags incompatibilities.</item></non-goals>
</MODULE_CONTRACT>
*/

import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const q2SnapshotPath = arg("--q2-snapshot");
const q3SnapshotPath = arg("--q3-snapshot");

const violations: string[] = [];
const warnings: string[] = [];
const hardSuppressions: string[] = [];

let scoreComparable = false;
let panelComparable = false;
let postStratComparable = false;
let frameDeltaRatio: number | undefined;

if (!q2SnapshotPath || !q3SnapshotPath) {
  violations.push("methodology_snapshots_missing");
} else {
  if (!(await fileExists(q2SnapshotPath))) {
    violations.push("q2_snapshot_not_found");
  } else if (!(await fileExists(q3SnapshotPath))) {
    violations.push("q3_snapshot_not_found");
  } else {
    const q2 = await readJsonFile<{
      codebookVersion: string;
      ontologyVersion: string;
      scoringVersion?: string;
      sourceFrameId: string;
    }>(q2SnapshotPath);
    const q3 = await readJsonFile<{
      codebookVersion: string;
      ontologyVersion: string;
      scoringVersion?: string;
      sourceFrameId: string;
    }>(q3SnapshotPath);

    scoreComparable = q2.codebookVersion === q3.codebookVersion && q2.ontologyVersion === q3.ontologyVersion;
    panelComparable = scoreComparable;
    postStratComparable = scoreComparable;

    if (!scoreComparable) {
      hardSuppressions.push("direct_score_delta_suppressed_version_mismatch");
      warnings.push(
        `codebook:${q2.codebookVersion}→${q3.codebookVersion}`,
        `ontology:${q2.ontologyVersion}→${q3.ontologyVersion}`,
      );
    }
    if (q2.sourceFrameId !== q3.sourceFrameId) {
      warnings.push("source_frame_changed");
    }
  }
}

await writeReport(
  "comparability",
  "comparability.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  hardSuppressions,
  { scoreComparable, panelComparable, postStratComparable, frameDeltaRatio },
);
