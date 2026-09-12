/*
<MODULE_CONTRACT>
<purpose>Compares Q2 and Q3 methodology snapshots using content-based identity to determine comparability and identify hard suppressions.</purpose>
<non-goals><item>Does not perform backcast — only flags incompatibilities.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing methodology-compare module contract for Compass-aware maintenance.</item>
  <item>RFC-0107: replace version-string comparison with content-based methodology identity (codebook hash, ontology hash, scoring semantics). Schema validation rejects absent fields; never compare undefined values.</item>
</CHANGE_SUMMARY>
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
      codebookSha256?: string;
      ontologySha256?: string;
      canonicalHash?: string;
      sourceFrameId: string;
    }>(q2SnapshotPath);
    const q3 = await readJsonFile<{
      codebookVersion: string;
      ontologyVersion: string;
      scoringVersion?: string;
      codebookSha256?: string;
      ontologySha256?: string;
      canonicalHash?: string;
      sourceFrameId: string;
    }>(q3SnapshotPath);

    const q2ContentId = q2.canonicalHash ?? q2.codebookSha256 ?? q2.ontologySha256;
    const q3ContentId = q3.canonicalHash ?? q3.codebookSha256 ?? q3.ontologySha256;

    if (!q2ContentId || !q3ContentId) {
      violations.push("methodology_content_identity_absent");
    } else {
      scoreComparable = q2ContentId === q3ContentId;
    }
    panelComparable = scoreComparable;
    postStratComparable = scoreComparable;

    if (!scoreComparable) {
      hardSuppressions.push("direct_score_delta_suppressed_content_mismatch");
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
