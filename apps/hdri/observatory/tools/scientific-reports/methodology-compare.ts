/*
<MODULE_CONTRACT>
<purpose>Compare adjacent-quarter declared methodology components and retain explicit product suppressions.</purpose>
<non-goals><item>Does not authenticate source artifacts, perform backcast or authorize panel and population products.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing methodology-compare module contract for Compass-aware maintenance.</item>
  <item>RFC-0107: replace version-string comparison with content-based methodology identity (codebook hash, ontology hash, scoring semantics). Schema validation rejects absent fields; never compare undefined values.</item>
  <item>Reject partial hashes and wrong-quarter inputs; bind diagnostics to consumed bytes and never infer panel eligibility from methodology equality.</item>
</CHANGE_SUMMARY>
*/

import { readBoundedFile } from "@warpgogol/pipeline-node";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { createHash } from "node:crypto";
import { compareMethodologySnapshots } from "../../run/score/methodology-comparison";
import { arg, computeInputFingerprint, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const q2SnapshotPath = arg("--q2-snapshot");
const q3SnapshotPath = arg("--q3-snapshot");

const { year, quarter } = parsePeriod(period);
const previousPeriod = `${quarter === 1 ? year - 1 : year}-q${quarter === 1 ? 4 : quarter - 1}`;
const violations: string[] = [];
const digests: string[] = [];
const MAX_SNAPSHOT_BYTES = 1024 * 1024;
async function readSnapshot(
  file: string | undefined,
  expectedPeriod: string,
  side: "previous" | "current",
) {
  if (!file) {
    violations.push(`${side}_snapshot_missing`);
    digests.push("missing");
    return null;
  }
  try {
    const bytes = await readBoundedFile(file, MAX_SNAPSHOT_BYTES);
    digests.push(createHash("sha256").update(bytes).digest("hex"));
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      violations.push(`${side}_snapshot_scope_or_status_invalid`);
      return null;
    }
    const snapshot = value as Record<string, unknown>;
    if (
      snapshot.period !== expectedPeriod ||
      snapshot.reportType !== "methodology-snapshot" ||
      snapshot.schemaVersion !== "1" ||
      snapshot.status !== "pass" ||
      !Array.isArray(snapshot.violations) ||
      snapshot.violations.length !== 0 ||
      typeof snapshot.capsuleId !== "string" ||
      !snapshot.capsuleId.trim() ||
      (side === "current" ? snapshot.capsuleId !== capsuleId : snapshot.capsuleId === capsuleId)
    ) {
      violations.push(`${side}_snapshot_scope_or_status_invalid`);
      return null;
    }
    return snapshot;
  } catch {
    violations.push(`${side}_snapshot_unreadable`);
    return null;
  }
}
const previous = await readSnapshot(q2SnapshotPath, previousPeriod, "previous");
const current = await readSnapshot(q3SnapshotPath, period, "current");
const comparison = compareMethodologySnapshots(previous, current);
violations.push(...comparison.violations);
const warnings = ["declared_content_comparison_only_not_authenticated_admission"];
if (previous && current && previous.sourceFrameId !== current.sourceFrameId)
  warnings.push("source_frame_changed");

await writeReport(
  "comparability",
  "comparability.json",
  evidenceDir,
  period,
  capsuleId,
  computeInputFingerprint(
    period,
    capsuleId,
    q2SnapshotPath ?? "",
    q3SnapshotPath ?? "",
    ...digests,
  ),
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  comparison.hardSuppressions,
  {
    scoreComparable: comparison.scoreComparable,
    panelComparable: comparison.panelComparable,
    postStratComparable: comparison.postStratComparable,
    changedComponents: comparison.changedComponents,
    operationallyQualified: false,
  },
);
if (violations.length) process.exitCode = 1;
