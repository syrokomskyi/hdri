---
title: Phase 1 · Audit · Aggregate · Snapshot
purpose: >-
  Run axe against every target in the sub-sampled cohort under
  rate-limited execution, persist raw reports to CAS, store per-tool metrics in
  axe_YYYY.db, and snapshot the database with full upstream provenance.
entryCriteria:
  - axe_YYYY.db is initialised (Phase 0 complete).
  - The audit cohort is loaded into pipeline state.
  - Either a fixture directory exists or the required live tool is installable (playwright + @axe-core/playwright).
successSignals:
  - audit_runs has one row per (tool, site) pair with ok flag and report_sha256.
  - axe_runs has violations_total + per-impact counts for every successful axe run.
  - Raw tool reports are stored under data/audit-reports/axe/{sha[0:2]}/{sha}.json.
  - audit-snapshot.json contains the axe-db SHA-256 and pipeline_inputs-style provenance.
exitCriteria:
  - audit-snapshot.json exists and contains a non-empty outputs.sha256 field.
members:
  - verify-upstream
  - axe-audit
  - summarize-audit
  - sign-source
---

