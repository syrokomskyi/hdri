/*
<MODULE_CONTRACT>
<purpose>Orchestrates the observatory pipeline execution lifecycle — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
  <item>Replace raw console.log with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
  <item>Mark successful runs as canonical published, supersede prior published runs for the period, and stamp failed runs.</item>
  <item>WP8: run into a staging DB seeded from canonical; finalizeRun only marks the run finished (candidate) — publication is gated behind a separate validate + promote step.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  createJsonLogger,
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
  stripAnsi,
} from "@syrokomskyi/pipeline-core";
import { ensureOutputDir } from "@syrokomskyi/pipeline-node/context";
import { inputDir, outputRootDir } from "../config";
import {
  DB_TARGET_ENV,
  getCanonicalDbDir,
  getStagingDbDir,
  openObservatoryDb,
} from "../db/connection";
import { createPipeline } from "../pipeline";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine";
import type { PipelineState } from "../pipeline/types";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { createClients } from "./create-clients";
import { bootstrapBrief } from "./input/bootstrap-brief";

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  // WP8: the pipeline always writes to the staging DB. Nothing it produces reaches
  // the canonical, dashboard-facing DB until `pnpm run promote` validates it and
  // atomically swaps it in. Default here so `pnpm start` is safe by construction;
  // an operator can still override the target explicitly.
  process.env[DB_TARGET_ENV] ??= "staging";

  const clients = createClients();

  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief } = await bootstrapBrief();

  if (process.env[DB_TARGET_ENV] === "staging") {
    await seedStagingFromCanonical(parsePeriod(brief.period).year);
  }

  const pipeline = createPipeline();
  const guide = createPipelineExecutionGuide(pipeline);

  const log = createJsonLogger({ app: "observatory", pipeline: "observatory" });

  log.info(
    "pipeline-start",
    stripAnsi(
      formatPipelineStart({
        inputDir,
        outputDir: outputRootDir,
        pipelineTitle: guide.title,
      }),
    ),
  );
  log.info("pipeline-overview", stripAnsi(formatPipelineOverview(guide)));

  const initialState: PipelineState = { brief };

  try {
    await runPipelineEngine({
      clients,
      gogols: pipeline.steps,
      initialState,
      guide,
      options,
    });

    if (initialState.runId) {
      finalizeRun(brief.period, initialState.runId, "finished");
    }
  } catch (error) {
    if (initialState.runId) {
      finalizeRun(brief.period, initialState.runId, "failed");
    }
    throw error;
  }

  log.info(
    "pipeline-finished",
    stripAnsi(
      formatPipelineFinished({
        pipelineTitle: guide.title,
        outputDir: outputRootDir,
      }),
    ),
  );
};

/**
 * WP8: the pipeline no longer publishes. A finished run is a *candidate* in the
 * staging DB — it stays `publication_status = 'candidate'` and is never marked
 * published here. Promotion to canonical (supersede prior published, set
 * published_at) happens only in `promote-to-canonical`, after `validate` returns
 * zero errors. This keeps every run reversible: canonical is untouched until an
 * explicit, gated swap.
 */
function finalizeRun(period: string, runId: string, status: "finished" | "failed"): void {
  const year = parsePeriod(period).year;
  const db = openObservatoryDb(year);
  try {
    const finishedAt = new Date().toISOString();
    db.prepare(`UPDATE pipeline_runs SET status = ?, finished_at = ? WHERE run_id = ?`).run(
      status,
      finishedAt,
      runId,
    );
  } finally {
    db.close();
  }
}

/**
 * Seeds the staging DB for `year` as a consistent copy of the canonical DB, so a
 * run adds the new quarter on top of all previously published quarters. Stale
 * staging files (incl. WAL/SHM) are cleared first. When no canonical DB exists
 * yet (first run of the year), staging is left empty for the migration to create.
 */
async function seedStagingFromCanonical(year: number): Promise<void> {
  const stagingDir = getStagingDbDir();
  await fs.mkdir(stagingDir, { recursive: true });

  const dbFile = `observatory_${year}.db`;
  const stagingPath = path.join(stagingDir, dbFile);
  for (const suffix of ["", "-wal", "-shm"]) {
    await fs.rm(`${stagingPath}${suffix}`, { force: true });
  }

  const canonicalPath = path.join(getCanonicalDbDir(), dbFile);
  try {
    await fs.access(canonicalPath);
  } catch {
    return; // first run of the year — migration creates a fresh staging DB
  }

  const src = new Database(canonicalPath, { readonly: true });
  try {
    await src.backup(stagingPath); // consistent copy, safe against the WAL
  } finally {
    src.close();
  }
}
