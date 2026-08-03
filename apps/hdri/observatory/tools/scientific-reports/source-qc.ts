/*
<MODULE_CONTRACT>
<purpose>Validates source ledger QC: coverage, unresolved items, and inter-source conflicts.</purpose>
<non-goals><item>Does not score sites or resolve conflicts — reports status only.</item></non-goals>
</MODULE_CONTRACT>
*/

import path from "node:path";
import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const sourceLedgerDir = arg("--source-ledger-dir");

const violations: string[] = [];
const warnings: string[] = [];
const hardSuppressions: string[] = [];

let coverage: number | undefined;
let unresolvedCount = 0;
let conflictCount = 0;

if (!sourceLedgerDir) {
  violations.push("source_ledger_dir_missing");
} else {
  const ledgerPath = path.resolve(sourceLedgerDir);
  if (!(await fileExists(ledgerPath))) {
    violations.push("source_ledger_not_found");
  } else {
    const manifestPath = path.join(ledgerPath, "ledger-manifest.json");
    if (!(await fileExists(manifestPath))) {
      violations.push("source_ledger_manifest_missing");
    } else {
      const manifest = await readJsonFile<{
        batches: { batchId: string; sourceCount: number; resolvedCount: number }[];
        conflicts: unknown[];
      }>(manifestPath);

      const totalSources = manifest.batches.reduce((sum, b) => sum + b.sourceCount, 0);
      const totalResolved = manifest.batches.reduce((sum, b) => sum + b.resolvedCount, 0);
      unresolvedCount = totalSources - totalResolved;
      conflictCount = manifest.conflicts.length;
      coverage = totalSources > 0 ? totalResolved / totalSources : 0;

      if (unresolvedCount > 0) warnings.push(`unresolved_sources:${unresolvedCount}`);
      if (conflictCount > 0) warnings.push(`source_conflicts:${conflictCount}`);
      if (coverage < 0.95) violations.push("source_coverage_below_threshold");
    }
  }
}

await writeReport(
  "source-qc",
  "source-qc.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  hardSuppressions,
  { coverage, unresolvedCount, conflictCount },
);
