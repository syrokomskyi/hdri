/*
<MODULE_CONTRACT>
<purpose>Initialises the observatory run: creates run_id, sets up the observatory DB, and records run metadata.</purpose>
<keywords>setup, run, database, initialization</keywords>
<responsibilities>
  <item>Creates the DB directory and observatory.db file.</item>
  <item>Applies DDL migrations and stamps schema metadata.</item>
  <item>Inserts a pipeline_runs row and writes run-meta.json artifact.</item>
  <item>Stores run_id in pipeline state.</item>
</responsibilities>
<non-goals>
  <item>Do not read upstream data — that is done by subsequent gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SetupObservatoryRunGogol">Gogol class for observatory run setup.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>P0.4: cross-period consistency check — warns if previous period missing or unfinished.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @org/pipeline-core.</item>
  <item>Initialise new runs as candidate publication records for the quarterly archive lifecycle.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { newId, parsePeriod } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { getDbDir, getObservatoryDbPath, openObservatoryDb } from '../db/connection';
import { migrateObservatory, stampObservatoryMeta } from '../db/migrate';

const OWNER_APP = 'digital-observatory';
const SCHEMA_VERSION = 'v1.0';

export class SetupObservatoryRunGogol extends Gogol {
  override readonly id = 'setup-observatory-run';

  override async run(ctx: PipelineContext): Promise<void> {
    const dbDir = getDbDir();
    await fs.mkdir(dbDir, { recursive: true });

    const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' })
      .withContext({ gogol: this.id });

    // P0.4: cross-period consistency check — warn if previous period not finished.
    await checkPreviousPeriod(ctx.state.brief.period, log);

    const runId = newId();
    const startedAt = new Date().toISOString();

    log.info('run-created', `run_id=${runId}`, { runId });

    const year = parsePeriod(ctx.state.brief.period).year;
    const db = openObservatoryDb(year);
    try {
      migrateObservatory(db);
      stampObservatoryMeta(db, OWNER_APP, SCHEMA_VERSION);

      db.prepare(`
        INSERT INTO pipeline_runs
          (run_id, pipeline_app, pipeline_version, period, ontology_version, codebook_version, started_at, status, publication_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 'candidate')
      `).run(
        runId,
        OWNER_APP,
        SCHEMA_VERSION,
        ctx.state.brief.period,
        ctx.state.brief.ontologyVersion,
        ctx.state.brief.codebookVersion,
        startedAt,
      );
    } finally {
      db.close();
    }

    ctx.state.runId = runId;

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'run-meta.json'),
      JSON.stringify({
        run_id: runId,
        period: ctx.state.brief.period,
        ontology_version: ctx.state.brief.ontologyVersion,
        codebook_version: ctx.state.brief.codebookVersion,
        started_at: startedAt,
        publication_status: 'candidate',
      }, null, 2),
    );

    log.info('setup-finished', 'Done. DB ready.', { runId });
  }
}

/**
 * Warns if the previous period's pipeline run is not marked as finished.
 * This helps operators detect gaps in quarterly data continuity.
 */
async function checkPreviousPeriod(period: string, log: import('@org/pipeline-core').JsonLogger): Promise<void> {
  const prev = previousPeriod(period);
  if (!prev) return;

  const year = parsePeriod(prev).year;
  const dbPath = getObservatoryDbPath(year);
  try {
    await fs.access(dbPath);
  } catch {
    log.warn('no-previous-db', `No DB found for previous period ${prev} — first run for this year?`, { previousPeriod: prev });
    return;
  }

  const db = openObservatoryDb(year);
  try {
    const row = db.prepare(
      `SELECT status FROM pipeline_runs WHERE period = ? ORDER BY started_at DESC LIMIT 1`,
    ).get(prev) as { status: string } | undefined;

    if (!row) {
      log.warn('no-previous-run', `No pipeline run found for previous period ${prev}.`, { previousPeriod: prev });
    } else if (row.status !== 'finished') {
      log.warn('previous-not-finished', `Previous period ${prev} has status "${row.status}" (not "finished"). Consider completing it before running ${period}.`, {
        previousPeriod: prev,
        previousStatus: row.status,
        currentPeriod: period,
      });
    }
  } finally {
    db.close();
  }
}

/**
 * Returns the previous quarter in "yyyy-qN" format, or null if period is malformed.
 */
function previousPeriod(period: string): string | null {
  const m = period.match(/^(\d{4})-q([1-4])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  if (q === 1) return `${year - 1}-q4`;
  return `${year}-q${q - 1}`;
}
