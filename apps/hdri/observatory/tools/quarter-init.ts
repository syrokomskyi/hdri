/*
<MODULE_CONTRACT>
<purpose>Generates or updates prior-capsules.json and persists a QuarterRecord for calendar-continuous quarter initialization.</purpose>
<non-goals>
  <item>Does not run factory or observatory pipelines.</item>
  <item>Does not modify sealed capsule artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0044: create quarter initialization tool that generates prior-capsules.json from a sealed prior capsule.</item>
  <item>RFC-0112: rename --current-period to --period, --prior-capsule to --predecessor. Persist QuarterRecord. Idempotent re-init returns same record.</item>
  <item>RFC-0113 A3: append-only quarter ledger — write per-period immutable revisions instead of overwriting quarter-record.json.</item>
  <item>RFC-0128: create the empty capsule-staging.json at quarter-open via createQuarterCapsuleStaging; --device-id and --instrument-plan-brief args.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  extractBatchIdsFromManifest,
  extractSourceLedgerHead,
  parsePriorCapsulesFile,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  discoverQuarterRecord,
  serializeQuarterRecord,
  validateQuarterRecord,
  createQuarterRevision,
  createQuarterLedgerIndex,
  advanceQuarterLedgerIndex,
  serializeQuarterRecordRevision,
  parseQuarterRecordRevision,
  serializeQuarterLedgerIndex,
  parseQuarterLedgerIndex,
  createQuarterCapsuleStaging,
  quarterCapsuleDir,
  parseInstrumentPlanFromFrontmatter,
  type CapsuleSignature,
  type HdriPeriod,
  type InstrumentPlanEntry,
  type PriorCapsuleEntry,
  type QuarterCapsule,
  type QuarterRecord,
  type QuarterRecordRevision,
  type QuarterLedgerIndex,
} from "@syrokomskyi/factory-core";
import {
  findRepoRoot,
  getDeviceId,
  getTransparencyKeysDir,
  loadVerificationKeys,
} from "@syrokomskyi/observatory-crypto";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const OUTPUT_DEFAULT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "factory",
  ".input",
  "prior-capsules.json",
);

// RFC-0128: the instrument plan is frozen at quarter-open from the contract
// brief — the same brief the factory apps read.
const INSTRUMENT_PLAN_BRIEF_DEFAULT = path.join(
  "apps",
  "hdri",
  "factory",
  "a-contract-ontology",
  ".input",
  "brief.md",
);

const main = async (): Promise<void> => {
  const priorCapsulePath = arg("--predecessor");
  const currentPeriod = arg("--period");
  const capsuleIdArg = arg("--capsule-id");
  const outputArg = arg("--output");
  const keysDirArg = arg("--keys-dir");
  const deviceIdArg = arg("--device-id");
  const instrumentPlanBriefArg = arg("--instrument-plan-brief");
  const force = hasFlag("--force");
  const jsonOutput = hasFlag("--json");

  if (!priorCapsulePath) {
    console.error(
      "Usage: quarter:init --predecessor <path> --period <yyyy-qn> --capsule-id <uuid-v7> [--output <path>] [--keys-dir <dir>] [--force] [--json]",
    );
    process.exit(1);
  }
  if (!currentPeriod) {
    console.error(
      "Usage: quarter:init --predecessor <path> --period <yyyy-qn> --capsule-id <uuid-v7> [--output <path>] [--keys-dir <dir>] [--force] [--json]",
    );
    process.exit(1);
  }
  if (!capsuleIdArg) {
    console.error(
      "Usage: quarter:init --predecessor <path> --period <yyyy-qn> --capsule-id <uuid-v7> [--output <path>] [--keys-dir <dir>] [--force] [--json]",
    );
    process.exit(1);
  }

  if (!/^\d{4}-q[1-4]$/.test(currentPeriod)) {
    console.error(`Invalid period: ${currentPeriod}. Expected format yyyy-qn (e.g. 2026-q3).`);
    process.exit(1);
  }
  const currentPeriodTyped = currentPeriod as HdriPeriod;

  const outputPath = outputArg ? path.resolve(outputArg) : OUTPUT_DEFAULT;
  const resolvedPriorCapsulePath = path.resolve(priorCapsulePath);

  // 1. Load capsule manifest
  try {
    await fs.access(resolvedPriorCapsulePath);
  } catch {
    console.error(`Prior capsule manifest not found: ${resolvedPriorCapsulePath}`);
    process.exit(1);
  }
  const manifestRaw = await fs.readFile(resolvedPriorCapsulePath, "utf8");
  const capsule = JSON.parse(manifestRaw) as QuarterCapsule;

  // 2. Load capsule signature from same directory
  const capsuleDir = path.dirname(resolvedPriorCapsulePath);
  const signaturePath = path.join(capsuleDir, "capsule-signature.json");
  try {
    await fs.access(signaturePath);
  } catch {
    console.error("Capsule signature file not found");
    process.exit(1);
  }
  const signatureRaw = await fs.readFile(signaturePath, "utf8");
  const signature = JSON.parse(signatureRaw) as CapsuleSignature;

  // 3. Load verification keys
  const keysDir = keysDirArg ?? getTransparencyKeysDir();
  const keyMap = await loadVerificationKeys(keysDir);

  // 4. Verify state === "sealed"
  if (capsule.state !== "sealed") {
    console.error(`Prior capsule is not sealed (state=${capsule.state})`);
    process.exit(1);
  }

  // 5. Verify capsule signature
  const verificationKey = keyMap.get(signature.signingKeyId);
  if (!verificationKey) {
    console.error(`Verification key not found for signingKeyId: ${signature.signingKeyId}`);
    console.error(`Check transparency/keys/ directory: ${keysDir}`);
    process.exit(1);
  }
  if (!verifyQuarterCapsuleSignature(capsule, signature, verificationKey)) {
    console.error("Prior capsule signature is invalid");
    process.exit(1);
  }

  // 6. Verify artifact hashes
  try {
    await verifyQuarterCapsuleArtifacts(capsuleDir, capsule);
  } catch (error) {
    console.error(
      `Capsule artifact failed closure verification: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // 7. Extract metadata
  const { ledgerHead, frameId } = await extractSourceLedgerHead(capsuleDir, capsule);
  const batchIds = extractBatchIdsFromManifest(capsule);

  // 8. Compute manifestPath relative to output directory
  const outputDir = path.dirname(outputPath);
  const manifestPath = path.relative(outputDir, resolvedPriorCapsulePath);

  const newEntry: PriorCapsuleEntry = {
    period: capsule.period as HdriPeriod,
    capsuleId: capsule.capsuleId,
    manifestPath,
    sourceLedgerHead: ledgerHead,
    frameId,
    batchIds,
  };

  // 9. Merge or create
  let priorCapsules: PriorCapsuleEntry[];
  let existingRaw: string | null = null;

  if (!force) {
    try {
      existingRaw = await fs.readFile(outputPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(
          `Existing prior-capsules.json is unreadable: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    }
  }

  if (existingRaw && !force) {
    let existing: ReturnType<typeof parsePriorCapsulesFile>;
    try {
      existing = parsePriorCapsulesFile(existingRaw);
    } catch (error) {
      console.error(
        `Existing prior-capsules.json is malformed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
    // Merge: replace entry with same period, preserve others
    priorCapsules = [
      ...existing.priorCapsules.filter((e) => e.period !== newEntry.period),
      newEntry,
    ];
  } else {
    priorCapsules = [newEntry];
  }

  const output = {
    schemaVersion: "1" as const,
    currentPeriod: currentPeriodTyped,
    priorCapsules,
  };

  // 10. Validate output
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  try {
    parsePriorCapsulesFile(serialized);
  } catch (error) {
    console.error(
      `Generated prior-capsules.json failed schema validation: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // 11. Write atomically (temp file + rename)
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  await fs.writeFile(tmpPath, serialized, "utf8");
  await fs.rename(tmpPath, outputPath);

  // 12. Persist QuarterRecord via append-only ledger (RFC-0113 A3)
  const ledgerDir = path.join(outputDir, "quarter-ledger");
  await fs.mkdir(ledgerDir, { recursive: true });

  const indexPath = path.join(ledgerDir, "ledger-index.json");
  let quarterRecord: QuarterRecord;
  let revision: QuarterRecordRevision;
  let ledgerIndex: QuarterLedgerIndex;

  // Check for existing ledger index
  let existingIndexRaw: string | null = null;
  try {
    existingIndexRaw = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        `Existing ledger-index.json is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }

  // Build the new QuarterRecord
  const priorCapsulesFile = parsePriorCapsulesFile(serialized);
  const newRecord = discoverQuarterRecord(priorCapsulesFile, currentPeriodTyped);
  quarterRecord = {
    ...newRecord,
    capsuleId: capsuleIdArg,
  };
  validateQuarterRecord(quarterRecord);

  if (existingIndexRaw) {
    try {
      const existingIndex = parseQuarterLedgerIndex(existingIndexRaw);
      // Load the current head revision
      const headRevisionPath = path.join(
        ledgerDir,
        `revision-${existingIndex.headRevision.toString().padStart(4, "0")}.json`,
      );
      let previousRevision: QuarterRecordRevision | null = null;
      try {
        const headRaw = await fs.readFile(headRevisionPath, "utf8");
        previousRevision = parseQuarterRecordRevision(headRaw);
      } catch {
        // Head revision file missing — treat as fresh
      }

      // Idempotent: if the existing head has same period and capsuleId, return it
      if (previousRevision && previousRevision.record.period === currentPeriodTyped) {
        quarterRecord = previousRevision.record;
        revision = previousRevision;
        ledgerIndex = existingIndex;
      } else {
        // Create new revision
        revision = createQuarterRevision(quarterRecord, previousRevision);
        ledgerIndex = advanceQuarterLedgerIndex(existingIndex, revision);
      }
    } catch {
      // Malformed index — create fresh ledger
      revision = createQuarterRevision(quarterRecord, null);
      ledgerIndex = createQuarterLedgerIndex(currentPeriodTyped, revision);
    }
  } else {
    // Fresh ledger
    revision = createQuarterRevision(quarterRecord, null);
    ledgerIndex = createQuarterLedgerIndex(currentPeriodTyped, revision);
  }

  // Write revision file (immutable)
  const revisionFileName = `revision-${revision.revision.toString().padStart(4, "0")}.json`;
  const revisionPath = path.join(ledgerDir, revisionFileName);
  const revisionSerialized = serializeQuarterRecordRevision(revision);
  const revisionTmpPath = `${revisionPath}.tmp`;
  await fs.writeFile(revisionTmpPath, revisionSerialized, "utf8");
  await fs.rename(revisionTmpPath, revisionPath);

  // Write updated index atomically
  const indexSerialized = serializeQuarterLedgerIndex(ledgerIndex);
  const indexTmpPath = `${indexPath}.tmp`;
  await fs.writeFile(indexTmpPath, indexSerialized, "utf8");
  await fs.rename(indexTmpPath, indexPath);

  // Also write quarter-record.json for backward compat (points to current head)
  const quarterRecordPath = path.join(outputDir, "quarter-record.json");
  const recordSerialized = serializeQuarterRecord(quarterRecord);
  const recordTmpPath = `${quarterRecordPath}.tmp`;
  await fs.writeFile(recordTmpPath, recordSerialized, "utf8");
  await fs.rename(recordTmpPath, quarterRecordPath);

  // 12b. RFC-0128: create the empty staging manifest at quarter-open. Each
  // stage's sealStage appends its admission entries to it during the quarter.
  const repoRoot = findRepoRoot();
  const deviceId = deviceIdArg ?? getDeviceId();
  const briefPath = instrumentPlanBriefArg
    ? path.resolve(instrumentPlanBriefArg)
    : path.join(repoRoot, INSTRUMENT_PLAN_BRIEF_DEFAULT);
  let instrumentPlan: InstrumentPlanEntry[];
  try {
    const briefRaw = await fs.readFile(briefPath, "utf8");
    instrumentPlan = parseInstrumentPlanFromFrontmatter(matter(briefRaw).data.instrumentPlan);
  } catch (error) {
    console.error(
      `Instrument plan brief unreadable/invalid (${briefPath}): ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  const factoryRootDir = path.join(repoRoot, "apps", "hdri", "factory");
  const newCapsuleDir = quarterCapsuleDir(
    factoryRootDir,
    deviceId,
    currentPeriodTyped,
    capsuleIdArg,
  );
  let stagingManifestPath: string;
  try {
    stagingManifestPath = await createQuarterCapsuleStaging(
      newCapsuleDir,
      { period: currentPeriodTyped, capsuleId: capsuleIdArg, deviceId },
      instrumentPlan,
    );
  } catch (error) {
    console.error(
      `Staging manifest creation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // 13. Output result
  const result = {
    command: "hdri.quarter.init",
    status: "ok",
    currentPeriod: currentPeriodTyped,
    priorCapsule: {
      period: newEntry.period,
      capsuleId: newEntry.capsuleId,
      batchIds: [...newEntry.batchIds],
      sourceLedgerHead: newEntry.sourceLedgerHead,
    },
    quarterRecord: {
      period: quarterRecord.period,
      predecessorPeriod: quarterRecord.predecessorPeriod,
      collection: quarterRecord.collection,
      publication: quarterRecord.publication,
    },
    totalEntries: priorCapsules.length,
    outputPath,
    quarterRecordPath,
    stagingManifestPath,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`quarter:init — OK`);
    console.log(`  Prior capsule: ${newEntry.period} (${newEntry.capsuleId})`);
    console.log(`  Batch IDs: ${[...newEntry.batchIds].join(", ") || "(none)"}`);
    console.log(`  Source ledger head: ${newEntry.sourceLedgerHead.slice(0, 16)}...`);
    console.log(
      `  Quarter record: ${quarterRecord.period} (predecessor: ${quarterRecord.predecessorPeriod ?? "none"})`,
    );
    console.log(`  Total entries: ${priorCapsules.length}`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Quarter record: ${quarterRecordPath}`);
    console.log(`  Staging manifest: ${stagingManifestPath}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
