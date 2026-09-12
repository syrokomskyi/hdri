/*
<MODULE_CONTRACT>
<purpose>Read-only JSON projection of HDRI execution state for a capsule. Never acquires work or repairs evidence.</purpose>
<non-goals>
  <item>Does not acquire leases, write evidence, or modify any state.</item>
  <item>Does not perform validation or sealing — use quarter:validate for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0101: add quarter:inspect read-only projection of execution state.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  executionDbPath,
  readOrderedEvents,
  readMeasurementEvidence,
  readJournalSegment,
} from "@syrokomskyi/factory-core";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const asJson = process.argv.includes("--json");
const capsulePath = arg("--capsule");
if (!capsulePath) {
  console.error("Usage: quarter:inspect -- --capsule <path> [--json]");
  process.exit(1);
}

const capsuleDir = path.resolve(capsulePath!);
const dbPath = executionDbPath(capsuleDir);

type InspectionReport = {
  schema: string;
  operation: string;
  status: string;
  inputFingerprint: string | null;
  evidenceRefs: string[];
  violations: string[];
};

let report: InspectionReport;

try {
  await fs.access(dbPath);
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(dbPath, { readonly: true });

  const events = readOrderedEvents(db);
  const segments = db
    .prepare("SELECT work_key_id FROM journal_segments ORDER BY sealed_at DESC")
    .all() as Array<{ work_key_id: string }>;

  const evidenceRefs: string[] = [];
  const violations: string[] = [];

  for (const row of db
    .prepare("SELECT work_key_id, attempt_id FROM measurement_evidence")
    .all() as Array<{ work_key_id: string; attempt_id: string }>) {
    const evidence = readMeasurementEvidence(db, row.work_key_id, row.attempt_id);
    if (evidence) {
      evidenceRefs.push(`${evidence.workKey}/${evidence.attemptId}`);
    }
  }

  for (const seg of segments) {
    const segment = readJournalSegment(db, seg.work_key_id);
    if (segment) {
      const segEvents = readOrderedEvents(db, seg.work_key_id);
      const recomputedSha = segEvents.map((e) => e.eventSha256).join("\n");
      const expectedSha = createHash("sha256").update(recomputedSha).digest("hex");
      if (expectedSha !== segment.segmentSha256) {
        violations.push(`SEGMENT_HASH_MISMATCH:${seg.work_key_id}`);
      }
    }
  }

  const inputFingerprint =
    events.length > 0
      ? ((events[0]!.payload as Record<string, unknown>)?.capsuleConfigSha256 ?? null)
      : null;

  report = {
    schema: "hdri-inspection@1",
    operation: "inspect",
    status: violations.length === 0 ? "pass" : "violations",
    inputFingerprint: inputFingerprint as string | null,
    evidenceRefs,
    violations,
  };

  db.close();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    report = {
      schema: "hdri-inspection@1",
      operation: "inspect",
      status: "no-execution-db",
      inputFingerprint: null,
      evidenceRefs: [],
      violations: ["NO_EXECUTION_DB"],
    };
  } else {
    throw error;
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Schema:     ${report.schema}`);
  console.log(`Operation:  ${report.operation}`);
  console.log(`Status:     ${report.status}`);
  console.log(`Evidence:   ${report.evidenceRefs.length} item(s)`);
  if (report.violations.length > 0) {
    console.log(`Violations: ${report.violations.join(", ")}`);
  }
}
