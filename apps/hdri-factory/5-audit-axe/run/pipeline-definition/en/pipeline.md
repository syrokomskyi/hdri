---
title: Site Axe Audit — Cohort Audit Pipeline
quickStart:
  - Create apps/hdri-factory/5-audit-axe/.input/brief.md with sourceToken, registryDbPath, concurrency, timeoutMs, and retries.
  - Point registryDbPath at the registry.db produced by catalog-harvest.
  - Live mode — drives Playwright via @axe-core/playwright.
  - Run the pipeline; raw tool reports land in data/audit-reports/axe/{sha[0:2]}/{sha}.json and aggregates in .output/data/db/axe_YYYY.db.
  - The final axe_YYYY.db snapshot is the data contract for downstream dashboards.
operatingRules:
  - Each run is idempotent — every INSERT uses ON CONFLICT DO UPDATE.
  - registry.db is opened read-only — this pipeline never writes to the catalog.
  - Audit reports are stored in content-addressed storage; the DB holds sha256 + aggregates only.
  - Rate limiting (token bucket + concurrency gate + circuit breaker + retry) is applied uniformly via @org/business-rate-limit.
  - Upstream DB snapshot SHA-256s (registry.db + axe_YYYY.db) are recorded in the final snapshot for DSGVO / peer-review audit.
members:
  - setup
  - audit
---

