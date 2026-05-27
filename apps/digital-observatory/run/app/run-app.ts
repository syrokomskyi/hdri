/*
<MODULE_CONTRACT>
<purpose>Orchestrates the observatory pipeline execution lifecycle.</purpose>
<keywords>pipeline execution, orchestration</keywords>
<responsibilities>
  <item>Bootstraps brief and creates clients.</item>
  <item>Ensures output directories exist.</item>
  <item>Assembles and runs the pipeline via the shared engine.</item>
</responsibilities>
<non-goals>
  <item>Do not handle raw data parsing or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runApp">Main entry point for pipeline execution.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>Replace raw console.log with structured NDJSON logger from @org/pipeline-core.</item>
  <item>Mark successful runs as canonical published, supersede prior published runs for the period, and stamp failed runs.</item>
</CHANGE_SUMMARY>
*/

import {
  createJsonLogger,
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
  stripAnsi,
} from '@org/pipeline-core';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { inputDir, outputRootDir } from '../config';
import { openObservatoryDb } from '../db/connection';
import { createPipeline } from '../pipeline';
import {
  type PipelineRunOptions,
  runPipelineEngine,
} from '../pipeline/engine';
import type { PipelineState } from '../pipeline/types';
import { parsePeriod } from '@org/observatory-core';
import { createClients } from './create-clients';
import { bootstrapBrief } from './input/bootstrap-brief';

export const runApp = async (
  options: PipelineRunOptions = {},
): Promise<void> => {
  const clients = createClients();

  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief } = await bootstrapBrief();

  const pipeline = createPipeline();
  const guide = createPipelineExecutionGuide(pipeline);

  const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' });

  log.info('pipeline-start', stripAnsi(formatPipelineStart({
    inputDir,
    outputDir: outputRootDir,
    pipelineTitle: guide.title,
  })));
  log.info('pipeline-overview', stripAnsi(formatPipelineOverview(guide)));

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
      finalizeRun(brief.period, initialState.runId, 'finished');
    }
  } catch (error) {
    if (initialState.runId) {
      finalizeRun(brief.period, initialState.runId, 'failed');
    }
    throw error;
  }

  log.info('pipeline-finished', stripAnsi(formatPipelineFinished({
    pipelineTitle: guide.title,
    outputDir: outputRootDir,
  })));
};

function finalizeRun(period: string, runId: string, status: 'finished' | 'failed'): void {
  const year = parsePeriod(period).year;
  const db = openObservatoryDb(year);
  try {
    const finishedAt = new Date().toISOString();
    if (status === 'finished') {
      const previousPublished = db.prepare(`
        SELECT run_id FROM pipeline_runs
        WHERE period = ?
          AND publication_status = 'published'
          AND run_id != ?
      `).all(period, runId) as Array<{ run_id: string }>;

      db.prepare(`
        UPDATE pipeline_runs
        SET publication_status = 'superseded'
        WHERE period = ?
          AND publication_status = 'published'
          AND run_id != ?
      `).run(period, runId);

      db.prepare(`
        UPDATE pipeline_runs
        SET status = ?, finished_at = ?, publication_status = 'published', published_at = ?, supersedes_run_id = ?
        WHERE run_id = ?
      `).run(
        status,
        finishedAt,
        finishedAt,
        previousPublished[0]?.run_id ?? null,
        runId,
      );
      return;
    }

    db.prepare(`
      UPDATE pipeline_runs
      SET status = ?, finished_at = ?
      WHERE run_id = ?
    `).run(status, finishedAt, runId);
  } finally {
    db.close();
  }
}
