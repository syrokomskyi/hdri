/*
<MODULE_CONTRACT>
<purpose>Advances the append-only quarter ledger (A3) by wiring transitions to actual collector, seal, release, and scheduler outcomes. Each transition creates a new immutable revision with chained digest.</purpose>
<non-goals>
  <item>Does not run collection, sealing, or release — it records their outcomes.</item>
  <item>Does not modify sealed capsule artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 Step 10: Wire A3 ledger transitions to actual collector, seal, release and scheduler outcomes.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseQuarterLedgerIndex,
  parseQuarterRecordRevision,
  serializeQuarterRecord,
  serializeQuarterRecordRevision,
  serializeQuarterLedgerIndex,
  createQuarterRevision,
  advanceQuarterLedgerIndex,
  validateQuarterRecord,
  computeRevisionDigest,
  type QuarterRecord,
  type QuarterRecordRevision,
  type QuarterCollectionStatus,
  type QuarterPublicationStatus,
} from "@syrokomskyi/factory-core";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const INPUT_DEFAULT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "factory",
  ".input",
);

type TransitionType = "schedule" | "collect" | "seal" | "release" | "suppress";

const TRANSITIONS: Record<TransitionType, string> = {
  schedule: "scheduled",
  collect: "collecting",
  seal: "sealed",
  release: "published",
  suppress: "suppressed",
};

const main = async (): Promise<void> => {
  const transitionArg = arg("--transition");
  const period = arg("--period");
  const inputArg = arg("--input");
  const capsuleIdArg = arg("--capsule-id");
  const checkpointSha256 = arg("--checkpoint-sha256");
  const jsonOutput = hasFlag("--json");

  if (!transitionArg || !period) {
    console.error(
      "Usage: quarter:record --transition <schedule|collect|seal|release|suppress> --period <yyyy-qn> [--input <dir>] [--capsule-id <uuid>] [--checkpoint-sha256 <hash>] [--json]",
    );
    process.exit(1);
  }

  if (!/^\d{4}-q[1-4]$/.test(period)) {
    console.error(`Invalid period: ${period}. Expected format yyyy-qn (e.g. 2026-q3).`);
    process.exit(1);
  }

  if (!(transitionArg in TRANSITIONS)) {
    console.error(
      `Invalid transition: ${transitionArg}. Expected one of: ${Object.keys(TRANSITIONS).join(", ")}`,
    );
    process.exit(1);
  }

  const transition = transitionArg as TransitionType;
  const inputDir = inputArg ? path.resolve(inputArg) : INPUT_DEFAULT;
  const ledgerDir = path.join(inputDir, "quarter-ledger");
  const indexPath = path.join(ledgerDir, "ledger-index.json");

  // Load existing ledger index
  let indexRaw: string;
  try {
    indexRaw = await fs.readFile(indexPath, "utf8");
  } catch {
    console.error(`No ledger found at ${indexPath}. Run quarter:init first.`);
    process.exit(1);
  }

  const existingIndex = parseQuarterLedgerIndex(indexRaw);

  // Load current head revision
  const headRevisionPath = path.join(
    ledgerDir,
    `revision-${existingIndex.headRevision.toString().padStart(4, "0")}.json`,
  );
  let previousRevision: QuarterRecordRevision;
  try {
    const headRaw = await fs.readFile(headRevisionPath, "utf8");
    previousRevision = parseQuarterRecordRevision(headRaw);
  } catch {
    console.error(`Head revision file missing: ${headRevisionPath}`);
    process.exit(1);
  }

  const currentRecord = previousRevision.record;

  // Validate period matches
  if (currentRecord.period !== period) {
    console.error(`Period mismatch: ledger head is ${currentRecord.period}, requested ${period}`);
    process.exit(1);
  }

  // Apply transition to produce new record
  const newRecord: QuarterRecord = { ...currentRecord };

  switch (transition) {
    case "schedule":
      newRecord.collection = "scheduled" as QuarterCollectionStatus;
      break;
    case "collect":
      newRecord.collection = "collecting" as QuarterCollectionStatus;
      break;
    case "seal":
      newRecord.collection = "sealed" as QuarterCollectionStatus;
      if (checkpointSha256) {
        newRecord.checkpointSha256 = checkpointSha256;
      }
      break;
    case "release":
      newRecord.publication = "published" as QuarterPublicationStatus;
      break;
    case "suppress":
      newRecord.publication = "suppressed" as QuarterPublicationStatus;
      break;
  }

  if (capsuleIdArg) {
    newRecord.capsuleId = capsuleIdArg;
  }

  validateQuarterRecord(newRecord);

  // Create new revision
  const newRevision = createQuarterRevision(newRecord, previousRevision);
  const newLedgerIndex = advanceQuarterLedgerIndex(existingIndex, newRevision);

  // Write revision file (immutable)
  const revisionFileName = `revision-${newRevision.revision.toString().padStart(4, "0")}.json`;
  const revisionPath = path.join(ledgerDir, revisionFileName);
  const revisionSerialized = serializeQuarterRecordRevision(newRevision);
  const revisionTmpPath = `${revisionPath}.tmp`;
  await fs.writeFile(revisionTmpPath, revisionSerialized, "utf8");
  await fs.rename(revisionTmpPath, revisionPath);

  // Write updated index atomically
  const indexSerialized = serializeQuarterLedgerIndex(newLedgerIndex);
  const indexTmpPath = `${indexPath}.tmp`;
  await fs.writeFile(indexTmpPath, indexSerialized, "utf8");
  await fs.rename(indexTmpPath, indexPath);

  // Update backward-compat quarter-record.json
  const quarterRecordPath = path.join(inputDir, "quarter-record.json");
  const recordSerialized = serializeQuarterRecord(newRecord);
  const recordTmpPath = `${quarterRecordPath}.tmp`;
  await fs.writeFile(recordTmpPath, recordSerialized, "utf8");
  await fs.rename(recordTmpPath, quarterRecordPath);

  const result = {
    command: "hdri.quarter.record",
    status: "ok",
    transition,
    period,
    previousRevision: previousRevision.revision,
    newRevision: newRevision.revision,
    previousDigest: computeRevisionDigest(previousRevision),
    newDigest: computeRevisionDigest(newRevision),
    record: {
      period: newRecord.period,
      capsuleId: newRecord.capsuleId,
      collection: newRecord.collection,
      publication: newRecord.publication,
      checkpointSha256: newRecord.checkpointSha256,
    },
  };

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`quarter:record — OK`);
    console.log(`  Transition: ${transition} → ${TRANSITIONS[transition]}`);
    console.log(`  Period: ${period}`);
    console.log(`  Revision: ${previousRevision.revision} → ${newRevision.revision}`);
    console.log(`  Collection: ${newRecord.collection}`);
    console.log(`  Publication: ${newRecord.publication}`);
    if (newRecord.checkpointSha256) {
      console.log(`  Checkpoint: ${newRecord.checkpointSha256.slice(0, 16)}...`);
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
