/*
<MODULE_CONTRACT>
<purpose>Read-only projection of the HDRI quarter ledger state — reports all QuarterRecord entries and unresolved continuity transitions.</purpose>
<non-goals>
  <item>Does not acquire leases, write evidence, or modify any state.</item>
  <item>Does not perform validation or sealing — use quarter:validate for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0112: add quarter:status read-only projection of quarter ledger state.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import {
  parseQuarterRecord,
  validateQuarterRecord,
  type QuarterRecord,
} from "@syrokomskyi/factory-core";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const jsonOutput = hasFlag("--json");
const inputArg = arg("--input");

const INPUT_DEFAULT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "factory",
  ".input",
);

const inputDir = inputArg ? path.resolve(inputArg) : INPUT_DEFAULT;

type StatusReport = {
  schema: string;
  operation: string;
  status: string;
  records: QuarterRecord[];
  violations: string[];
};

const main = async (): Promise<void> => {
  const report: StatusReport = {
    schema: "hdri-quarter-status@1",
    operation: "quarter:status",
    status: "ok",
    records: [],
    violations: [],
  };

  // Read quarter-record.json
  const recordPath = path.join(inputDir, "quarter-record.json");
  try {
    const raw = await fs.readFile(recordPath, "utf8");
    const record = parseQuarterRecord(raw);
    validateQuarterRecord(record);
    report.records.push(record);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      report.violations.push("NO_QUARTER_RECORD");
    } else {
      report.violations.push(
        `QUARTER_RECORD_INVALID: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Check for gap records
  for (const record of report.records) {
    if (record.collection === "gap") {
      report.violations.push(
        `GAP_QUARTER: ${record.period} has no predecessor collection (gap record required)`,
      );
    }
    if (record.predecessorPeriod !== null && record.predecessorManifestSha256 === null) {
      report.violations.push(
        `MISSING_PREDECESSOR: ${record.period} references ${record.predecessorPeriod} but no manifest hash`,
      );
    }
  }

  if (report.violations.length > 0) {
    report.status = "degraded";
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`quarter:status — ${report.status}`);
    if (report.records.length === 0) {
      console.log("  No quarter records found.");
    }
    for (const record of report.records) {
      console.log(`  ${record.period}: collection=${record.collection}, publication=${record.publication}`);
      if (record.predecessorPeriod) {
        console.log(`    predecessor: ${record.predecessorPeriod}`);
      }
    }
    if (report.violations.length > 0) {
      console.log("  Violations:");
      for (const v of report.violations) {
        console.log(`    - ${v}`);
      }
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
