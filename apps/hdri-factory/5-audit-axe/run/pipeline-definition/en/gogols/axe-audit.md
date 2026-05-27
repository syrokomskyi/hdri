---
factory: axe-audit
title: axe-core Audit
purpose: >-
  Run axe-core accessibility checks against every cohort target, persist the
  raw JSON report to CAS, and record violations_total plus per-impact counts
  (critical / serious / moderate / minor) into audits_YYYY.db.
details: >-
  Dual-mode. **Fixture mode** (brief.axeFixtureDir set): reads {siteId}.json or
  {domain}.json as an axe-core AxeResults object. **Live mode**: dynamic-imports
  playwright + @axe-core/playwright, launches chromium, navigates to the target
  URL, and calls AxeBuilder.analyze(). Execution is wrapped in a RateLimiter
  (concurrency gate + token bucket + circuit breaker + retry). Raw reports land
  under data/audit-reports/axe/{sha[0:2]}/{sha}.json. Each row is upserted into
  audit_runs with ok + error_class, and into axe_runs with violation totals,
  per-impact breakdown, and nodes_scanned.
inputs:
  - Audit cohort from pipeline state.
  - brief.axeFixtureDir (optional), brief.axeConcurrency, brief.axeTimeoutMs, brief.axeRetries.
outputs:
  - Raw axe reports in CAS.
  - Rows in audit_runs + axe_runs.
  - axe-report.json — per-site ok / error summary.
  - axe-report.md — human-readable rollup with violation totals.
definitionOfDone:
  - axe-report.json exists with one entry per cohort target.
---

