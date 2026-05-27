---
title: Phase 1 · Audit · Aggregate · Snapshot
purpose: >-
  Run Lighthouse against targets under rate-limited execution, persist raw
  reports to CAS, store per-tool metrics in lighthouse_YYYY.db, and snapshot
  the database with full upstream provenance.
entryCriteria:
  - lighthouse_YYYY.db is initialised (Phase 0 complete).
  - Either a fixture directory exists or the required live tool is installable (lighthouse + chrome-launcher).
successSignals:
  - audit_runs has one row per (tool, site) pair with ok flag and report_sha256.
  - lighthouse_runs has aggregated scores (performance, accessibility, best_practices, seo) + LCP/CLS/TBT for every successful Lighthouse run.
  - Raw tool reports are stored under data/audit-reports/lighthouse/{sha[0:2]}/{sha}.json.
  - audit-snapshot.json contains the lighthouse-db SHA-256 and pipeline_inputs-style provenance.
exitCriteria:
  - audit-snapshot.json exists and contains a non-empty outputs.sha256 field.
members:
  - verify-upstream
  - lighthouse-audit
  - summarize-audit
  - sign-source
---

