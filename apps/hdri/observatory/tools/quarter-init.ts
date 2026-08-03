/*
<MODULE_CONTRACT>
<purpose>Generates or updates prior-capsules.json from a sealed prior capsule manifest for quarter initialization.</purpose>
<non-goals>
  <item>Does not seal legacy quarters — that is quarter:seal-legacy (RFC-0045).</item>
  <item>Does not run factory or observatory pipelines.</item>
  <item>Does not modify sealed capsule artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0044: create quarter initialization tool that generates prior-capsules.json from a sealed prior capsule.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs/promises";
import path from "node:path";
import {
  extractBatchIdsFromManifest,
  extractSourceLedgerHead,
  parsePriorCapsulesFile,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  type CapsuleSignature,
  type HdriPeriod,
  type PriorCapsuleEntry,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { getTransparencyKeysDir, loadVerificationKeys } from "@syrokomskyi/observatory-crypto";

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

const main = async (): Promise<void> => {
  const priorCapsulePath = arg("--prior-capsule");
  const currentPeriod = arg("--current-period");
  const outputArg = arg("--output");
  const keysDirArg = arg("--keys-dir");
  const force = hasFlag("--force");
  const jsonOutput = hasFlag("--json");

  if (!priorCapsulePath) {
    console.error(
      "Usage: quarter:init --prior-capsule <path> --current-period <yyyy-qn> [--output <path>] [--keys-dir <dir>] [--force] [--json]",
    );
    process.exit(1);
  }
  if (!currentPeriod) {
    console.error(
      "Usage: quarter:init --prior-capsule <path> --current-period <yyyy-qn> [--output <path>] [--keys-dir <dir>] [--force] [--json]",
    );
    process.exit(1);
  }

  if (!/^\d{4}-q[1-4]$/.test(currentPeriod)) {
    console.error(
      `Invalid current period: ${currentPeriod}. Expected format yyyy-qn (e.g. 2026-q3).`,
    );
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

  // 12. Output result
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
    totalEntries: priorCapsules.length,
    outputPath,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`quarter:init — OK`);
    console.log(`  Prior capsule: ${newEntry.period} (${newEntry.capsuleId})`);
    console.log(`  Batch IDs: ${[...newEntry.batchIds].join(", ") || "(none)"}`);
    console.log(`  Source ledger head: ${newEntry.sourceLedgerHead.slice(0, 16)}...`);
    console.log(`  Total entries: ${priorCapsules.length}`);
    console.log(`  Output: ${outputPath}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
