/*
<MODULE_CONTRACT>
<purpose>Bind preservation, qualification, and capacity evidence digests into a ReadinessReceipt for a quarter.</purpose>
<non-goals>
  <item>Does not verify evidence content — callers supply digests.</item>
  <item>Does not gate pipeline execution — use ProgramGate for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0112: add quarter:readiness tool that binds evidence digests into ReadinessReceipt.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import {
  createReadinessReceipt,
  validateReadinessReceipt,
  type ReadinessReceipt,
} from "@syrokomskyi/factory-core";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const jsonOutput = hasFlag("--json");
const periodArg = arg("--period");
const inputArg = arg("--input");

const INPUT_DEFAULT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "factory",
  ".input",
);

const inputDir = inputArg ? path.resolve(inputArg) : INPUT_DEFAULT;

const main = async (): Promise<void> => {
  if (!periodArg) {
    console.error("Usage: quarter:readiness --period <yyyy-qn> [--input <dir>] [--json]");
    process.exit(1);
  }

  if (!/^\d{4}-q[1-4]$/.test(periodArg)) {
    console.error(`Invalid period: ${periodArg}. Expected format yyyy-qn (e.g. 2026-q4).`);
    process.exit(1);
  }

  // Read evidence digests from input directory
  const readDigest = async (filename: string): Promise<string> => {
    try {
      const raw = await fs.readFile(path.join(inputDir, filename), "utf8");
      return raw.trim();
    } catch {
      return "";
    }
  };

  const preservationGateSha256 = await readDigest("preservation-gate-sha256.txt");
  const qualificationSha256 = await readDigest("qualification-sha256.txt");
  const predecessorSha256 = await readDigest("predecessor-sha256.txt");
  const capacityReportSha256 = await readDigest("capacity-report-sha256.txt");

  // Check for obsolete runtime entries
  let obsoleteRuntimeRemaining = false;
  try {
    await fs.access(path.join(inputDir, "obsolete-runtime-remains.flag"));
    obsoleteRuntimeRemaining = true;
  } catch {
    // File doesn't exist — no obsolete runtime
  }

  const receipt: ReadinessReceipt = createReadinessReceipt({
    period: periodArg,
    preservationGateSha256,
    qualificationSha256,
    predecessorSha256,
    capacityReportSha256,
    obsoleteRuntimeRemaining,
  });

  validateReadinessReceipt(receipt);

  // Persist receipt
  const receiptPath = path.join(inputDir, "readiness-receipt.json");
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(receiptPath, serialized, "utf8");

  if (jsonOutput) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`quarter:readiness — ${receipt.status}`);
    console.log(`  Period: ${receipt.period}`);
    if (receipt.status === "blocked") {
      console.log("  Blockers:");
      for (const b of receipt.blockers) {
        console.log(`    - ${b}`);
      }
    } else {
      console.log("  All evidence present — ready.");
    }
    console.log(`  Receipt: ${receiptPath}`);
  }

  if (receipt.status === "blocked") {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
