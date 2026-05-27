import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// batch_step_runs — idempotency record per batch-level step
// ---------------------------------------------------------------------------

export const batchStepRuns = sqliteTable('batch_step_runs', {
  batchId: text('batch_id').notNull(),
  stepName: text('step_name').notNull(),
  status: text('status').notNull().default('pending'),
  startedAt: integer('started_at'),
  doneAt: integer('done_at'),
  errorMsg: text('error_msg'),
}, (t) => ({
  pk: primaryKey({ columns: [t.batchId, t.stepName] }),
}));

export type BatchStepRun = typeof batchStepRuns.$inferSelect;
export type NewBatchStepRun = typeof batchStepRuns.$inferInsert;

// ---------------------------------------------------------------------------
// site_step_runs — idempotency record per site-level step within a batch
// ---------------------------------------------------------------------------

export const siteStepRuns = sqliteTable('site_step_runs', {
  batchId: text('batch_id').notNull(),
  siteId: integer('site_id').notNull(),
  stepName: text('step_name').notNull(),
  status: text('status').notNull().default('pending'),
  startedAt: integer('started_at'),
  doneAt: integer('done_at'),
  errorMsg: text('error_msg'),
}, (t) => ({
  pk: primaryKey({ columns: [t.batchId, t.siteId, t.stepName] }),
  batchStepIdx: index('ssr_batch_step').on(t.batchId, t.stepName),
}));

export type SiteStepRun = typeof siteStepRuns.$inferSelect;
export type NewSiteStepRun = typeof siteStepRuns.$inferInsert;

// ---------------------------------------------------------------------------
// pipeline_inputs — cross-pipeline provenance log, owner: hdri-scoring
//
// Records which upstream database snapshot (identified by SHA256 of the file)
// was used for a given scoring run. Required for reproducibility under
// peer-review and DSGVO audit.
// ---------------------------------------------------------------------------

export const pipelineInputs = sqliteTable('pipeline_inputs', {
  scoringRunId: text('scoring_run_id').notNull(),
  sourceApp: text('source_app').notNull(),
  sourceBatchId: text('source_batch_id').notNull(),
  dbPath: text('db_path').notNull(),
  snapshotSha256: text('snapshot_sha256').notNull(),
  takenAt: integer('taken_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.scoringRunId, t.sourceApp, t.sourceBatchId] }),
  runIdx: index('pi_run_idx').on(t.scoringRunId),
}));

export type PipelineInput = typeof pipelineInputs.$inferSelect;
export type NewPipelineInput = typeof pipelineInputs.$inferInsert;
