---
factory: lighthouse-audit
title: Lighthouse Audit
purpose: >-
  Run Google Lighthouse against every cohort target, persist the raw JSON
  report to CAS, and record performance, accessibility, best-practices, and
  SEO scores plus LCP / CLS / TBT into audits_YYYY.db.
details: >-
  Dual-mode. **Fixture mode** (brief.lighthouseFixtureDir set): reads
  {siteId}.json or {domain}.json from the fixture directory and treats it as a
  Lighthouse result. **Live mode**: dynamic-imports lighthouse + chrome-launcher
  and drives a headless Chrome instance per target. Execution is wrapped in a
  RateLimiter (concurrency gate + token bucket + circuit breaker + retry with
  exponential backoff and jitter). Breaker threshold is max(3, 20 percent of
  targets). CircuitOpenError never retries. Raw reports are written to
  data/audit-reports/lighthouse/{sha[0:2]}/{sha}.json; only the sha256 and
  extracted aggregates land in the DB. Each row is upserted into audit_runs
  with ok flag + error_class, and into lighthouse_runs with score fields
  multiplied by 100.
inputs:
  - Audit cohort from pipeline state.
  - brief.lighthouseFixtureDir (optional), brief.lighthouseConcurrency, brief.lighthouseTimeoutMs, brief.lighthouseRetries.
outputs:
  - Raw lighthouse reports in CAS.
  - Rows in audit_runs + lighthouse_runs.
  - lighthouse-report.json — per-site ok / error summary.
  - lighthouse-report.md — human-readable rollup with averages.
definitionOfDone:
  - lighthouse-report.json exists with one entry per cohort target.
---

