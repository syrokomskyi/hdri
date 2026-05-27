import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// scores — one row per (scoring_run_id, site_id), owner: hdri-scoring
// ---------------------------------------------------------------------------

export const scores = sqliteTable('scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scoringRunId: text('scoring_run_id').notNull(),
  siteId: integer('site_id').notNull(),
  cohortId: text('cohort_id'),
  overallScore: real('overall_score'),
  confidence: real('confidence'),
  codebookId: text('codebook_id').notNull(),
  codebookVersion: text('codebook_version').notNull(),
  /** SHA-256 of the raw signals bundle used — provenance for audits. */
  signalsSha256: text('signals_sha256'),
  scoredAt: integer('scored_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniq:     uniqueIndex('scores_run_site').on(t.scoringRunId, t.siteId),
  runIdx:   index('scores_run_idx').on(t.scoringRunId),
  cohortIdx: index('scores_cohort_idx').on(t.cohortId),
}));

export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;

// ---------------------------------------------------------------------------
// score_dimensions — per-dimension contribution for each site score
// ---------------------------------------------------------------------------

export const scoreDimensions = sqliteTable('score_dimensions', {
  scoringRunId: text('scoring_run_id').notNull(),
  siteId: integer('site_id').notNull(),
  dimensionId: text('dimension_id').notNull(),
  score: real('score'),
  confidence: real('confidence'),
  effectiveWeight: real('effective_weight'),
}, (t) => ({
  pk: primaryKey({ columns: [t.scoringRunId, t.siteId, t.dimensionId] }),
  runIdx: index('sd_run_idx').on(t.scoringRunId),
}));

export type ScoreDimension = typeof scoreDimensions.$inferSelect;
export type NewScoreDimension = typeof scoreDimensions.$inferInsert;

// ---------------------------------------------------------------------------
// score_indicator_traces — per-indicator audit rows (optional but recommended)
// ---------------------------------------------------------------------------

export const scoreIndicatorTraces = sqliteTable('score_indicator_traces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scoringRunId: text('scoring_run_id').notNull(),
  siteId: integer('site_id').notNull(),
  dimensionId: text('dimension_id').notNull(),
  indicatorId: text('indicator_id').notNull(),
  inputKey: text('input_key').notNull(),
  rawValueJson: text('raw_value_json'),
  ruleType: text('rule_type').notNull(),
  score: real('score'),
  weight: real('weight').notNull(),
  confidence: real('confidence').notNull(),
  note: text('note'),
}, (t) => ({
  uniq: uniqueIndex('sit_run_site_ind').on(
    t.scoringRunId, t.siteId, t.dimensionId, t.indicatorId,
  ),
  runIdx: index('sit_run_idx').on(t.scoringRunId),
}));

export type ScoreIndicatorTrace = typeof scoreIndicatorTraces.$inferSelect;
export type NewScoreIndicatorTrace = typeof scoreIndicatorTraces.$inferInsert;

// ---------------------------------------------------------------------------
// manual_reviews — IRR (inter-rater reliability) review rows
//
// Two independent raters each score a stratified sample of sites on the same
// set of indicators. Cohen's κ is then computed across both columns.
// Owner: hdri-scoring tools (sample-for-manual-review, compute-irr)
// ---------------------------------------------------------------------------

export const manualReviews = sqliteTable('manual_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Identifies the IRR round, e.g. "irr-2026-q1". */
  irrRoundId: text('irr_round_id').notNull(),
  siteId: integer('site_id').notNull(),
  /** Which scoring run the sampled site belongs to. */
  scoringRunId: text('scoring_run_id').notNull(),
  /** Indicator id being rated (codebook indicator id). */
  indicatorId: text('indicator_id').notNull(),
  /** Rater identifier — anonymous label ("rater_a", "rater_b", …). */
  raterId: text('rater_id').notNull(),
  /**
   * Ordinal rating assigned by the rater.
   * For boolean indicators: 0 / 1.
   * For scale indicators: integer in declared range.
   */
  rating: integer('rating').notNull(),
  /** Optional free-text justification. */
  note: text('note'),
  reviewedAt: integer('reviewed_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniq: uniqueIndex('mr_round_site_ind_rater').on(
    t.irrRoundId, t.siteId, t.indicatorId, t.raterId,
  ),
  roundIdx: index('mr_round_idx').on(t.irrRoundId),
  siteIdx: index('mr_site_idx').on(t.siteId),
}));

export type ManualReview = typeof manualReviews.$inferSelect;
export type NewManualReview = typeof manualReviews.$inferInsert;
