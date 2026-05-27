---
factory: summarize-audit
title: Summarize Audit
purpose: >-
  Compute per-tool coverage statistics, aggregate axe violation totals,
  hash audits_YYYY.db plus upstream registry.db, and write the final
  audit-snapshot artifact used as the data contract for downstream apps.
details: >-
  Queries audit_runs and axe_runs for rollup stats. Computes ok / error counts
  per tool and aggregated axe violation counts by impact level (critical,
  serious, moderate, minor). Hashes the audits_YYYY.db file on disk and, for
  provenance, the upstream registry.db. Writes audit-snapshot.json with
  outputs.sha256 + provenance[] and a human-readable audit-snapshot.md.
inputs:
  - audits_YYYY.db at the output path.
  - registry.db at the resolved path.
  - Audit cohort from pipeline state.
outputs:
  - audit-snapshot.json — outputs sha256, inputs provenance, per-tool stats.
  - audit-snapshot.md — human-readable summary.
definitionOfDone:
  - audit-snapshot.json exists and outputs.sha256 is a 64-char hex string.
---

