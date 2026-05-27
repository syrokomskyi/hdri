---
factory: summarize-audit
title: Summarize Audit
purpose: >-
  Compute per-tool coverage statistics, aggregate Lighthouse averages and axe
  violation totals, hash audits_YYYY.db plus upstream registry.db, and write the
  final audit-snapshot artifact used as the data contract for downstream apps.
details: >-
  Queries audit_runs, lighthouse_runs, and axe_runs for rollup stats. Computes
  ok / error counts per tool, error-class histogram, and — for Lighthouse —
  averages of the four scores and core web vitals across successful runs.
  Hashes the audits_YYYY.db file on disk and, for provenance, the upstream
  registry.db. Writes audit-snapshot.json with outputs.sha256 + inputs[] and a
  human-readable audit-snapshot.md.
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

