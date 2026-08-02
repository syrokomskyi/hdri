---
factory: axe-audit-by-bundesland
title: axe Violations by Bundesland
purpose: >-
  Aggregate axe-core violation totals (total, critical, serious, moderate,
  minor) per Bundesland using the cohort geo-metadata already in pipeline state.
details: >-
  Builds a siteId → bundesland lookup from cohort.targets (no extra DB read).
  Queries axe_runs and sums violation counts by state.
  Sites without a bundesland are grouped as "undefined" and sorted last.
inputs:
  - Cohort targets from pipeline state (bundesland field).
  - audits_YYYY.db — axe_runs.
outputs:
  - axe-by-bundesland.json — per-state violation totals.
  - axe-by-bundesland.csv — flat CSV for spreadsheet analysis.
  - axe-by-bundesland.md — human-readable violations table per state.
definitionOfDone:
  - axe-by-bundesland.json exists in the gogol output directory.
---
