/*
<MODULE_CONTRACT>
<purpose>Two-phase cumulative source batch discovery: prior capsule segments from prior-capsules.json plus the current quarter's input folder.</purpose>
<non-goals>
  <item>Does not re-parse old raw folders; prior segments are read from sealed capsule manifests.</item>
  <item>Does not modify or delete sealed capsules or their artifacts.</item>
  <item>Does not scan .input/batches for prior-quarter folders.</item>
  <item>Do not include future-quarter folders in the current frozen frame.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0030: rewrite to two-phase discovery — prior capsules from prior-capsules.json + current batch folder verification.</item>
  <item>Remove raw folder scanning (listBatchNames) for prior quarters.</item>
  <item>Remove selectCumulativeBatchNames — prior batch IDs come from sealed manifests.</item>
  <item>RFC-0043: add isFirstQuarter parameter; replace silent ENOENT catch with explicit PipelinePauseError or warning.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";
import {
  parsePriorCapsulesFile,
  type LedgerDiscoveryResult,
  type PriorCapsuleRef,
} from "@syrokomskyi/factory-core";
import type { Brief } from "../../brief.js";
import { getBatchInputDir } from "../../paths.js";
import { inputDir } from "../../config.js";

export type BootstrappedBatches = {
  batchNames: string[];
  discovery: LedgerDiscoveryResult;
};

const PRIOR_CAPSULES_PATH = "prior-capsules.json";

export const discoverLedger = async (
  sourceToken: string,
  isFirstQuarter = false,
): Promise<LedgerDiscoveryResult> => {
  // Phase 1: Read prior-capsules.json for prior sealed capsule segments
  const priorCapsulesPath = `${inputDir}/${PRIOR_CAPSULES_PATH}`;
  let priorRefs: PriorCapsuleRef[] = [];
  try {
    const raw = await fs.readFile(priorCapsulesPath, "utf8");
    const parsed = parsePriorCapsulesFile(raw);
    priorRefs = parsed.priorCapsules.map((entry) => ({
      capsuleId: entry.capsuleId,
      period: entry.period,
      manifestPath: entry.manifestPath,
      segmentHashes: [],
      batchIds: entry.batchIds,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new PipelinePauseError(
        [
          "Pipeline paused.",
          `prior-capsules.json is malformed: ${error instanceof Error ? error.message : String(error)}`,
          "Fix the file and rerun.",
        ].join("\n"),
      );
    }
    if (!isFirstQuarter) {
      throw new PipelinePauseError(
        [
          "Pipeline paused.",
          "prior-capsules.json not found.",
          "If this is NOT the first quarter, run `pnpm quarter:init` in the observatory.",
          "If this IS the first quarter, pass --first-quarter or set FIRST_QUARTER=true.",
        ].join("\n"),
      );
    }
    console.warn(
      "[bootstrap] WARNING: prior-capsules.json not found. Running in first-quarter mode.",
    );
  }

  // Phase 2: Collect batch IDs from prior capsules
  const priorBatchIds = priorRefs.flatMap((ref) => ref.batchIds);

  // Phase 3: Verify current batch folder exists (stat only, no readdir)
  try {
    const stat = await fs.stat(getBatchInputDir(sourceToken));
    if (!stat.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        `Batch directory not found: ${getBatchInputDir(sourceToken)}`,
        `The current folder name must exactly match sourceToken from brief.md ("${sourceToken}").`,
        "",
        "Expected structure:",
        `  .input/batches/${sourceToken}/firmenabc.com/*.csv`,
        `  .input/batches/${sourceToken}/<city>.stadtbranchenbuch.com/*.html`,
        `  .input/batches/${sourceToken}/branchenverzeichnis.org/**/*.html`,
        `  .input/batches/${sourceToken}/work5.de/**/*.html`,
      ].join("\n"),
    );
  }

  // Combine: prior batch IDs + current sourceToken (deduplicated, sorted)
  const batchSet = new Set<string>([...priorBatchIds, sourceToken]);
  const currentBatchIds = [...batchSet].sort();

  return {
    currentBatchIds,
    priorCapsuleSegments: priorRefs,
    ledgerHead: "",
  };
};

export const bootstrapBatches = async (
  brief: Brief,
  isFirstQuarter = false,
): Promise<BootstrappedBatches> => {
  const discovery = await discoverLedger(brief.sourceToken, isFirstQuarter);

  console.log(
    `[bootstrap] Discovery: ${discovery.currentBatchIds.length} batch(es) ` +
      `(${discovery.priorCapsuleSegments.length} prior capsule(s), current: ${brief.sourceToken})`,
  );

  return { batchNames: [...discovery.currentBatchIds], discovery };
};
